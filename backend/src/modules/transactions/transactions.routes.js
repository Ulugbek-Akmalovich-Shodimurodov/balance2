import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { auditService } from '../audit/audit.service.js';
import { createDeliveryAct } from '../deliveryActs/deliveryActs.service.js';

const router = Router();
router.use(authenticate);

router.post('/assign', authorize('ADMIN', 'MANAGER'), asyncHandler(async (req, res) => {
  const { assetId, userId, departmentId, note } = req.body;
  const created = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: Number(assetId) } });
    const targetDepartment = departmentId ? await tx.department.findUnique({ where: { id: Number(departmentId) } }) : null;
    if (!asset || (departmentId && !targetDepartment)) throw new Error('Qurilma yoki bo‘lim topilmadi');

    const isWarehouse = targetDepartment?.name?.trim().toLocaleLowerCase() === 'omborxona';
    if (isWarehouse) {
      const assetData = { assignedUserId: null, departmentId: targetDepartment.id };
      await tx.asset.update({ where: { id: asset.id }, data: assetData });
      await auditService.log(req.user.id, 'ASSET_UPDATE', 'Asset', asset.id, { ...assetData, source: 'TRANSACTION_ASSIGN' }, req.ip, tx);
      return tx.transaction.create({ data: { assetId: asset.id, fromUserId: asset.assignedUserId, actorId: req.user.id, fromDepartmentId: asset.departmentId, toDepartmentId: targetDepartment.id, type: 'RETURN', note: note || 'Omborxonaga qabul qilindi' } });
    }

    const employee = userId ? await tx.user.findUnique({ where: { id: Number(userId) } }) : null;
    if (!employee) throw new Error('Xodimni tanlang');
    const targetDepartmentId = employee.departmentId || targetDepartment?.id || asset.departmentId;
    const assetData = { assignedUserId: employee.id, departmentId: targetDepartmentId };
    await tx.asset.update({ where: { id: asset.id }, data: assetData });
    await auditService.log(req.user.id, 'ASSET_UPDATE', 'Asset', asset.id, { ...assetData, source: 'TRANSACTION_ASSIGN' }, req.ip, tx);
    const transaction = await tx.transaction.create({ data: { assetId: asset.id, userId: employee.id, fromUserId: asset.assignedUserId, actorId: req.user.id, fromDepartmentId: asset.departmentId, toDepartmentId: targetDepartmentId, type: 'ASSIGN', note } });
    const [creator, department, assignedAssets] = await Promise.all([
      tx.user.findUnique({ where: { id: req.user.id } }),
      targetDepartmentId ? tx.department.findUnique({ where: { id: targetDepartmentId } }) : null,
      tx.asset.findMany({
        where: { assignedUserId: employee.id },
        orderBy: { id: 'asc' },
      }),
    ]);
    await createDeliveryAct(tx, {
      transactionId: transaction.id,
      asset,
      assets: assignedAssets,
      recipient: employee,
      creator,
      department,
    });
    return transaction;
  });
  res.status(201).json(created);
}));

router.post('/return', authorize('ADMIN', 'MANAGER', 'TECHNICIAN'), asyncHandler(async (req, res) => {
  const { assetId, note } = req.body;
  const created = await prisma.$transaction(async (tx) => {
    const asset = await tx.asset.findUnique({ where: { id: Number(assetId) } });
    if (!asset) throw new Error('Qurilma topilmadi');
    const assetData = { assignedUserId: null };
    await tx.asset.update({ where: { id: Number(assetId) }, data: assetData });
    await auditService.log(req.user.id, 'ASSET_UPDATE', 'Asset', Number(assetId), { ...assetData, source: 'TRANSACTION_RETURN' }, req.ip, tx);
    return tx.transaction.create({ data: { assetId: Number(assetId), fromUserId: asset.assignedUserId, actorId: req.user.id, fromDepartmentId: asset.departmentId, toDepartmentId: asset.departmentId, type: 'RETURN', note } });
  });
  res.status(201).json(created);
}));

router.get('/asset/:assetId', asyncHandler(async (req, res) => {
  res.json(await prisma.transaction.findMany({ where: { assetId: Number(req.params.assetId) }, include: { user: { select: { id: true, fullName: true } }, fromUser: { select: { id: true, fullName: true } }, actor: { select: { id: true, fullName: true } }, fromDepartment: { select: { id: true, name: true } }, toDepartment: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } }));
}));

export default router;
