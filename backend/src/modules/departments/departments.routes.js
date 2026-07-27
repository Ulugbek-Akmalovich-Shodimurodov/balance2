import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
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
router.get('/', asyncHandler(async (_, res) => {
  const rows = await prisma.department.findMany({ include: { parent:true, _count:{select:{assets:true}} }, orderBy:{name:'asc'} });
  const byId = hierarchy(rows);
  const totalAssets = (department) => (department._count?.assets || 0) + department.children.reduce((sum, child) => sum + totalAssets(child), 0);
  res.json(rows.map((row) => ({ ...byId.get(row.id), totalAssets: totalAssets(byId.get(row.id)) })));
}));
router.get('/:id', asyncHandler(async (req, res) => {
  const rows = await prisma.department.findMany({ include: { parent:true, _count:{select:{assets:true}} }, orderBy:{name:'asc'} });
  const byId = hierarchy(rows); const root = byId.get(Number(req.params.id));
  if (!root) return res.status(404).json({ message: 'Bo‘lim topilmadi' });
  const childIds = descendantIds(root.id, byId); const ids = [root.id, ...childIds];
  const assets = await prisma.asset.findMany({ where: { departmentId: { in: ids } }, include: assetInclude, orderBy:{name:'asc'} });
  const subDepartmentAssets = childIds.map((departmentId) => { const department = byId.get(departmentId); return { id: department.id, name: department.name, assets: assets.filter((asset) => asset.departmentId === departmentId) }; }).filter((group) => group.assets.length > 0);
  res.json({ ...root, assets: assets.filter((asset) => asset.departmentId === root.id), subDepartmentAssets, totalAssets: assets.length });
}));
router.post('/', authorize('ADMIN','MANAGER'), asyncHandler(async (req, res) => {
  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.department.create({ data:req.body });
    await auditService.log(req.user.id, 'DEPARTMENT_CREATE', 'Department', created.id, { objectName: created.name }, req.ip, tx);
    return created;
  });
  res.status(201).json(item);
}));
router.put('/:id', authorize('ADMIN','MANAGER'), asyncHandler(async (req, res) => {
  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.department.update({ where:{ id:Number(req.params.id) }, data:req.body });
    await auditService.log(req.user.id, 'DEPARTMENT_UPDATE', 'Department', updated.id, { objectName: updated.name }, req.ip, tx);
    return updated;
  });
  res.json(item);
}));
router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.$transaction(async (tx) => {
    const item = await tx.department.findUnique({ where:{ id:Number(req.params.id) } });
    if (!item) return;
    await auditService.log(req.user.id, 'DEPARTMENT_DELETE', 'Department', item.id, { objectName: item.name }, req.ip, tx);
    await tx.department.delete({ where:{ id:item.id } });
  });
  res.status(204).end();
}));
export default router;
