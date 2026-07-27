import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
const router=Router(); router.use(authenticate, authorize('ADMIN','MANAGER'));
router.get('/', asyncHandler(async (_, res) => {
  const logs = await prisma.auditLog.findMany({ include: { actor:true }, orderBy: { createdAt:'desc' }, take:200 });
  const idsFor = (entity) => logs.filter((log) => log.entity === entity && log.entityId).map((log) => log.entityId);
  const [assets, users, departments] = await Promise.all([
    prisma.asset.findMany({ where: { id: { in: idsFor('Asset') } }, select: { id:true, model:true, name:true, inventoryNumber:true } }),
    prisma.user.findMany({ where: { id: { in: idsFor('User') } }, select: { id:true, fullName:true } }),
    prisma.department.findMany({ where: { id: { in: idsFor('Department') } }, select: { id:true, name:true } })
  ]);
  const assetNames = new Map(assets.map((item) => [item.id, item.model || item.name]));
  const assetInventoryNumbers = new Map(assets.map((item) => [item.id, item.inventoryNumber]));
  const userNames = new Map(users.map((item) => [item.id, item.fullName]));
  const departmentNames = new Map(departments.map((item) => [item.id, item.name]));
  const objectNameFor = (log) => log.metadata?.objectName
    || (log.entity === 'Asset' && (assetNames.get(log.entityId) || log.metadata?.model || log.metadata?.name))
    || (log.entity === 'User' && (userNames.get(log.entityId) || log.metadata?.fullName))
    || (log.entity === 'Department' && (departmentNames.get(log.entityId) || log.metadata?.name))
    || `${log.entity} #${log.entityId || '—'}`;
  res.json(logs.map((log) => ({
    ...log,
    objectName: objectNameFor(log),
    inventoryNumber: log.entity === 'Asset'
      ? (assetInventoryNumbers.get(log.entityId) || log.metadata?.inventoryNumber || null)
      : null,
    macAddress: log.metadata?.macAddress || null
  })));
}));
export default router;
