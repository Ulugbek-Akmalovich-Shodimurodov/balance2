import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { assertOrganizationAccess, authenticate, authorize, isSuperAdmin } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { auditService } from '../audit/audit.service.js';

const assetInclude = { assignedUser: { select: { id:true, fullName:true } } };

const hierarchy = (departments) => {
  const byId = new Map(departments.map((department) => [department.id, { ...department, children: [] }]));
  byId.forEach((department) => { if (department.parentId && byId.has(department.parentId)) byId.get(department.parentId).children.push(department); });
  return byId;
};

const descendantIds = (rootId, byId) => {
  const result = []; const visit = (id) => { const department = byId.get(id); department?.children.forEach((child) => { result.push(child.id); visit(child.id); }); };
  visit(rootId); return result;
};

const router = Router();
router.use(authenticate);
router.get('/', asyncHandler(async (req, res) => {
  const rows = await prisma.department.findMany({ where:isSuperAdmin(req.user)?{}:{organizationId:Number(req.user.managedOrganizationId)}, include: { parent:true, organization:true, _count:{select:{assets:true,departmentPositions:true,users:true}} }, orderBy:{name:'asc'} });
  const byId = hierarchy(rows);
  const totalAssets = (department) => (department._count?.assets || 0) + department.children.reduce((sum, child) => sum + totalAssets(child), 0);
  res.json(rows.map((row) => ({ ...byId.get(row.id), totalAssets: totalAssets(byId.get(row.id)) })));
}));
router.get('/:id', asyncHandler(async (req, res) => {
  const rows = await prisma.department.findMany({ include: { parent:true, organization:true, _count:{select:{assets:true,departmentPositions:true,users:true}} }, orderBy:{name:'asc'} });
  const byId = hierarchy(rows); const root = byId.get(Number(req.params.id));
  if (!root) return res.status(404).json({ message: 'Bo‘lim topilmadi' });
  assertOrganizationAccess(req.user, root.organizationId);
  const childIds = descendantIds(root.id, byId); const ids = [root.id, ...childIds];
  const assets = await prisma.asset.findMany({ where: { departmentId: { in: ids } }, include: assetInclude, orderBy:{name:'asc'} });
  const subDepartmentAssets = childIds.map((departmentId) => { const department = byId.get(departmentId); return { id: department.id, name: department.name, assets: assets.filter((asset) => asset.departmentId === departmentId) }; }).filter((group) => group.assets.length > 0);
  res.json({ ...root, assets: assets.filter((asset) => asset.departmentId === root.id), subDepartmentAssets, totalAssets: assets.length });
}));
router.post('/', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const organizationId = Number(req.body.organizationId);
  if (!Number.isInteger(organizationId)) return res.status(400).json({ message: 'Tashkilotni tanlang' });
  assertOrganizationAccess(req.user, organizationId);
  if (req.body.parentId) {
    const parent = await prisma.department.findUnique({ where: { id: Number(req.body.parentId) } });
    if (!parent || parent.organizationId !== organizationId) return res.status(400).json({ message: 'Yuqori bo‘lim shu tashkilotga tegishli bo‘lishi kerak' });
  }
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.department.create({ data:{ ...req.body, organizationId, parentId:req.body.parentId ? Number(req.body.parentId) : null } });
    await auditService.log(req.user.id, 'DEPARTMENT_CREATE', 'Department', created.id, { objectName: created.name }, req.ip, tx);
    return created;
  });
  res.status(201).json(item);
}));
router.put('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const organizationId = Number(req.body.organizationId);
  if (!Number.isInteger(organizationId)) return res.status(400).json({ message: 'Tashkilotni tanlang' });
  assertOrganizationAccess(req.user, organizationId);
  const current = await prisma.department.findUnique({ where: { id: Number(req.params.id) } });
  if (!current) return res.status(404).json({ message: 'Bo‘lim topilmadi' });
  assertOrganizationAccess(req.user, current.organizationId);
  if (req.body.parentId) {
    const parent = await prisma.department.findUnique({ where: { id: Number(req.body.parentId) } });
    if (!parent || parent.organizationId !== organizationId) return res.status(400).json({ message: 'Yuqori bo‘lim shu tashkilotga tegishli bo‘lishi kerak' });
  }
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.department.update({ where:{ id:Number(req.params.id) }, data:{ ...req.body, organizationId, parentId:req.body.parentId ? Number(req.body.parentId) : null } });
    await auditService.log(req.user.id, 'DEPARTMENT_UPDATE', 'Department', updated.id, { objectName: updated.name }, req.ip, tx);
    return updated;
  });
  res.json(item);
}));
router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const current = await prisma.department.findUnique({ where: { id: Number(req.params.id) } });
  if (!current) return res.status(204).end();
  assertOrganizationAccess(req.user, current.organizationId);
  await prisma.$transaction(async (tx) => {
    const item = await tx.department.findUnique({ where:{ id:Number(req.params.id) } });
    if (!item) return;
    await auditService.log(req.user.id, 'DEPARTMENT_DELETE', 'Department', item.id, { objectName: item.name }, req.ip, tx);
    await tx.department.delete({ where:{ id:item.id } });
  });
  res.status(204).end();
}));
export default router;
