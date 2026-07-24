import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/stats', asyncHandler(async (_, res) => {
  const [
    total,
    active,
    broken,
    disposed,
    assigned,
    users,
    departments,
    openMaintenance,
    perDepartment,
    recentAssets,
  ] = await Promise.all([
    prisma.asset.count(),
    prisma.asset.count({ where: { status: 'ACTIVE' } }),
    prisma.asset.count({ where: { status: 'BROKEN' } }),
    prisma.asset.count({ where: { status: 'DISPOSED' } }),
    prisma.asset.count({ where: { assignedUserId: { not: null } } }),
    prisma.user.count(),
    prisma.department.count(),
    prisma.maintenanceLog.count({ where: { status: { in: ['NEW', 'IN_PROGRESS'] } } }),
    prisma.department.findMany({
      select: { id: true, name: true, _count: { select: { assets: true } } },
      orderBy: { assets: { _count: 'desc' } },
    }),
    prisma.asset.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        model: true,
        inventoryNumber: true,
        status: true,
        createdAt: true,
        department: { select: { name: true } },
        assignedUser: { select: { fullName: true } },
      },
    }),
  ]);

  res.json({
    total,
    active,
    broken,
    disposed,
    assigned,
    unassigned: total - assigned,
    users,
    departments,
    openMaintenance,
    activeRate: total ? Math.round((active / total) * 100) : 0,
    assignedRate: total ? Math.round((assigned / total) * 100) : 0,
    perDepartment: perDepartment.map((department) => ({
      id: department.id,
      name: department.name,
      total: department._count.assets,
    })),
    recentAssets,
  });
}));

export default router;
