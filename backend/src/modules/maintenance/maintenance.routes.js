import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const where = req.user.role === 'ADMIN' ? {} : { asset: { assignedUserId: req.user.id } };
  const logs = await prisma.maintenanceLog.findMany({
    where,
    include: {
      asset: {
        include: {
          department: { select: { id: true, name: true } },
          assignedUser: { select: { id: true, fullName: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(logs);
}));

router.post('/report', asyncHandler(async (req, res) => {
  const { assetId, title, description } = req.body;
  const asset = await prisma.asset.findUnique({ where: { id: Number(assetId) } });

  if (!asset || (req.user.role !== 'ADMIN' && asset.assignedUserId !== req.user.id)) {
    return res.status(403).json({ message: 'Faqat o‘zingizga biriktirilgan qurilma uchun so‘rov yuborishingiz mumkin' });
  }

  await prisma.asset.update({ where: { id: asset.id }, data: { status: 'BROKEN' } });
  const log = await prisma.maintenanceLog.create({
    data: {
      assetId: asset.id,
      title,
      description,
      reportedUserId: asset.assignedUserId,
      reportedDepartmentId: asset.departmentId
    }
  });
  res.status(201).json(log);
}));

router.get('/warehouse-assets', authorize('ADMIN'), asyncHandler(async (_, res) => {
  const warehouse = await prisma.department.findFirst({
    where: { name: { equals: 'Omborxona', mode: 'insensitive' } }
  });
  if (!warehouse) return res.json([]);

  const assets = await prisma.asset.findMany({
    where: { departmentId: warehouse.id },
    select: {
      id: true,
      name: true,
      model: true,
      inventoryNumber: true,
      serialNumber: true,
      status: true,
      assignedUserId: true,
      assignedUser: { select: { fullName: true } }
    },
    orderBy: { inventoryNumber: 'asc' }
  });
  res.json(assets);
}));

router.post('/:id/action', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const { status, resolutionNote, replacementAssetId } = req.body;
  const log = await prisma.maintenanceLog.findUnique({ where: { id: Number(req.params.id) } });
  if (!log) return res.status(404).json({ message: 'So‘rov topilmadi' });

  const broken = await prisma.asset.findUnique({ where: { id: log.assetId } });
  if (!broken) return res.status(404).json({ message: 'Qurilma topilmadi' });

  // These values remain available even after the asset is temporarily placed in the warehouse.
  const lastAssignment = (!log.reportedUserId || !log.reportedDepartmentId)
    ? await prisma.transaction.findFirst({
      where: { assetId: broken.id, userId: { not: null } },
      orderBy: { createdAt: 'desc' }
    })
    : null;
  const originalUserId = log.reportedUserId ?? broken.assignedUserId ?? lastAssignment?.userId ?? null;
  const originalDepartmentId = log.reportedDepartmentId ?? broken.departmentId ?? lastAssignment?.toDepartmentId ?? null;

  if (status === 'REPLACED') {
    if (!replacementAssetId) {
      return res.status(400).json({ message: 'Omborxonadan almashtiruvchi qurilmani tanlang' });
    }
    const replacement = await prisma.asset.findUnique({ where: { id: Number(replacementAssetId) } });
    if (!replacement) return res.status(404).json({ message: 'Tanlangan qurilma topilmadi' });

    await prisma.$transaction([
      prisma.asset.update({
        where: { id: broken.id },
        data: { status: 'DISPOSED', assignedUserId: null }
      }),
      prisma.asset.update({
        where: { id: replacement.id },
        data: { assignedUserId: originalUserId, departmentId: originalDepartmentId }
      }),
      prisma.transaction.create({
        data: {
          assetId: replacement.id,
          userId: originalUserId,
          actorId: req.user.id,
          fromDepartmentId: replacement.departmentId,
          toDepartmentId: originalDepartmentId,
          type: 'ASSIGN',
          note: `${broken.inventoryNumber} o‘rniga almashtirildi`
        }
      })
    ]);

    const updated = await prisma.maintenanceLog.update({
      where: { id: log.id },
      data: {
        status,
        resolutionNote: `${resolutionNote || ''} | Almashtiruvchi qurilma: ${replacement.inventoryNumber}`,
        resolvedAt: new Date()
      }
    });
    return res.json(updated);
  }

  let assetData = {};
  if (status === 'REPAIRED') {
    assetData = {
      status: 'ACTIVE',
      assignedUserId: originalUserId,
      departmentId: originalDepartmentId
    };
  }

  if (status === 'WAREHOUSED') {
    const warehouse = await prisma.department.findFirst({
      where: { name: { equals: 'Omborxona', mode: 'insensitive' } }
    });
    if (!warehouse) return res.status(400).json({ message: 'Omborxona bo‘limi topilmadi' });
    assetData = { status: 'BROKEN', assignedUserId: null, departmentId: warehouse.id };
  }

  await prisma.asset.update({ where: { id: log.assetId }, data: assetData });
  const updated = await prisma.maintenanceLog.update({
    where: { id: log.id },
    data: {
      status,
      resolutionNote,
      // Backfill older requests while their original assignment is still known.
      reportedUserId: log.reportedUserId ?? originalUserId,
      reportedDepartmentId: log.reportedDepartmentId ?? originalDepartmentId,
      resolvedAt: ['REPAIRED', 'WAREHOUSED'].includes(status) ? new Date() : null
    }
  });
  res.json(updated);
}));

router.post('/', authorize('ADMIN', 'MANAGER', 'TECHNICIAN'), asyncHandler(async (req, res) => {
  res.status(201).json(await prisma.maintenanceLog.create({ data: req.body }));
}));

router.put('/:id', authorize('ADMIN', 'MANAGER', 'TECHNICIAN'), asyncHandler(async (req, res) => {
  res.json(await prisma.maintenanceLog.update({ where: { id: Number(req.params.id) }, data: req.body }));
}));

router.delete('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  await prisma.maintenanceLog.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
}));

export default router;
