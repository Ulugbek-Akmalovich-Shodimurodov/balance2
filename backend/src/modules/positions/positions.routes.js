import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/db.js';
import { assertOrganizationAccess, authenticate, authorize, isSuperAdmin } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { auditService } from '../audit/audit.service.js';

const router = Router();
router.use(authenticate);

const titleSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Lavozim nomini kiriting').max(120),
    organizationId: z.coerce.number().int().positive('Tashkilotni tanlang'),
    departmentIds: z.array(z.coerce.number().int().positive()).max(200).default([]),
  }).strict(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const assignmentSchema = z.object({
  body: z.object({
    departmentId: z.coerce.number().int().positive(),
    positionId: z.coerce.number().int().positive(),
  }).strict(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

const includePosition = {
  organization: true,
  departmentPositions: {
    include: {
      department: true,
      users: { select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } },
      _count: { select: { users: true } },
    },
  },
};

const validateDepartments = async (db, organizationId, departmentIds) => {
  const uniqueIds = [...new Set(departmentIds)];
  const departments = await db.department.findMany({ where: { id: { in: uniqueIds } } });
  if (departments.length !== uniqueIds.length || departments.some((item) => item.organizationId !== organizationId)) {
    throw new ApiError(400, 'Tanlangan bo‘limlarning barchasi ushbu tashkilotga tegishli bo‘lishi kerak');
  }
  return uniqueIds;
};

router.get('/', asyncHandler(async (req, res) => {
  const organizationId = isSuperAdmin(req.user)
    ? (req.query.organizationId ? Number(req.query.organizationId) : undefined)
    : Number(req.user.managedOrganizationId);
  const positions = await prisma.position.findMany({
    where: organizationId ? { organizationId } : {},
    include: includePosition,
    orderBy: [{ organization: { name: 'asc' } }, { name: 'asc' }],
  });
  res.json(positions);
}));

router.post('/', authorize('ADMIN'), validate(titleSchema), asyncHandler(async (req, res) => {
  assertOrganizationAccess(req.user, req.validated.body.organizationId);
  const item = await prisma.$transaction(async (tx) => {
    const { departmentIds, ...data } = req.validated.body;
    const validDepartmentIds = await validateDepartments(tx, data.organizationId, departmentIds);
    const created = await tx.position.create({
      data: {
        ...data,
        departmentPositions: { create: validDepartmentIds.map((departmentId) => ({ departmentId })) },
      },
      include: includePosition,
    });
    await auditService.log(req.user.id, 'POSITION_CREATE', 'Position', created.id, { objectName: created.name }, req.ip, tx);
    return created;
  });
  res.status(201).json(item);
}));

router.put('/:id', authorize('ADMIN'), validate(titleSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.position.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Lavozim topilmadi');
  assertOrganizationAccess(req.user, existing.organizationId);
  assertOrganizationAccess(req.user, req.validated.body.organizationId);
  const item = await prisma.$transaction(async (tx) => {
    const { departmentIds, ...data } = req.validated.body;
    const validDepartmentIds = await validateDepartments(tx, data.organizationId, departmentIds);
    const current = await tx.position.findUnique({
      where: { id },
      include: { departmentPositions: { include: { _count: { select: { users: true } } } } },
    });
    if (!current) throw new ApiError(404, 'Lavozim topilmadi');
    const desiredIds = new Set(validDepartmentIds);
    const assignmentsToRemove = current.departmentPositions.filter((assignment) => !desiredIds.has(assignment.departmentId));
    if (assignmentsToRemove.some((assignment) => assignment._count.users > 0)) {
      throw new ApiError(400, 'Olib tashlanayotgan bo‘limlarda ushbu lavozimga xodimlar biriktirilgan. Avval xodimlarning lavozimini o‘zgartiring');
    }
    await tx.departmentPosition.deleteMany({ where: { id: { in: assignmentsToRemove.map((item) => item.id) } } });
    const existingDepartmentIds = new Set(current.departmentPositions.map((assignment) => assignment.departmentId));
    const departmentIdsToAdd = validDepartmentIds.filter((departmentId) => !existingDepartmentIds.has(departmentId));
    const updated = await tx.position.update({
      where: { id },
      data: {
        ...data,
        departmentPositions: { create: departmentIdsToAdd.map((departmentId) => ({ departmentId })) },
      },
      include: includePosition,
    });
    await auditService.log(req.user.id, 'POSITION_UPDATE', 'Position', updated.id, { objectName: updated.name }, req.ip, tx);
    return updated;
  });
  res.json(item);
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const position = await prisma.position.findUnique({
    where: { id },
    include: { departmentPositions: { include: { _count: { select: { users: true } } } } },
  });
  if (!position) throw new ApiError(404, 'Lavozim topilmadi');
  assertOrganizationAccess(req.user, position.organizationId);
  const employeeCount = position.departmentPositions.reduce((sum, item) => sum + item._count.users, 0);
  if (employeeCount) throw new ApiError(400, 'Bu lavozim xodimlarga biriktirilgan');
  await prisma.$transaction(async (tx) => {
    await auditService.log(req.user.id, 'POSITION_DELETE', 'Position', id, { objectName: position.name }, req.ip, tx);
    await tx.position.delete({ where: { id } });
  });
  res.status(204).end();
}));

router.post('/assignments', authorize('ADMIN'), validate(assignmentSchema), asyncHandler(async (req, res) => {
  const { departmentId, positionId } = req.validated.body;
  const [department, position] = await Promise.all([
    prisma.department.findUnique({ where: { id: departmentId } }),
    prisma.position.findUnique({ where: { id: positionId } }),
  ]);
  if (!department || !position) throw new ApiError(404, 'Bo‘lim yoki lavozim topilmadi');
  assertOrganizationAccess(req.user, department.organizationId);
  if (department.organizationId !== position.organizationId) {
    throw new ApiError(400, 'Bo‘lim va lavozim bir tashkilotga tegishli bo‘lishi kerak');
  }
  const item = await prisma.departmentPosition.create({
    data: { departmentId, positionId },
    include: { department: true, position: true },
  });
  res.status(201).json(item);
}));

router.delete('/assignments/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const assignment = await prisma.departmentPosition.findUnique({
    where: { id },
    include: { department: true, _count: { select: { users: true } } },
  });
  if (!assignment) throw new ApiError(404, 'Lavozim biriktirmasi topilmadi');
  assertOrganizationAccess(req.user, assignment.department.organizationId);
  if (assignment._count.users) throw new ApiError(400, 'Bu lavozimda xodimlar bor. Avval ularni boshqa lavozimga o‘tkazing');
  await prisma.departmentPosition.delete({ where: { id } });
  res.status(204).end();
}));

export default router;
