import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/db.js';
import { assertOrganizationAccess, authenticate, authorize, authorizeStructureAdmin, isSuperAdmin } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { auditService } from '../audit/audit.service.js';

const router = Router();
router.use(authenticate);

const schema = z.object({
  body: z.object({ name: z.string().trim().min(2).max(160) }).strict(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  res.json(await prisma.organization.findMany({
    where: isSuperAdmin(req.user) ? {} : { id: Number(req.user.managedOrganizationId) },
    include: { _count: { select: { departments: true, positions: true } } },
    orderBy: { name: 'asc' },
  }));
}));

router.post('/', authorize('SUPER_ADMIN', 'ADMIN'), validate(schema), asyncHandler(async (req, res) => {
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({ data: req.validated.body });
    await auditService.log(req.user.id, 'ORGANIZATION_CREATE', 'Organization', created.id, { objectName: created.name }, req.ip, tx);
    return created;
  });
  res.status(201).json(item);
}));

router.put('/:id', authorizeStructureAdmin, validate(schema), asyncHandler(async (req, res) => {
  assertOrganizationAccess(req.user, req.params.id);
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.organization.update({ where: { id: Number(req.params.id) }, data: req.validated.body });
    await auditService.log(req.user.id, 'ORGANIZATION_UPDATE', 'Organization', updated.id, { objectName: updated.name }, req.ip, tx);
    return updated;
  });
  res.json(item);
}));

router.delete('/:id', authorize('SUPER_ADMIN', 'ADMIN'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const item = await prisma.organization.findUnique({
    where: { id },
    include: { _count: { select: { departments: true, positions: true } } },
  });
  if (!item) throw new ApiError(404, 'Tashkilot topilmadi');
  if (item._count.departments || item._count.positions) {
    throw new ApiError(400, 'Tashkilotda bo‘lim yoki lavozimlar mavjud');
  }
  await prisma.organization.delete({ where: { id } });
  res.status(204).end();
}));

export default router;
