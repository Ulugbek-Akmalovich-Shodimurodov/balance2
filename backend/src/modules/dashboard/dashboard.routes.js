import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { authenticate, authorizeOrganizationManager, isOrganizationAdmin } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate, authorizeOrganizationManager);

router.get('/stats', asyncHandler(async (req, res) => {
  const organizationId = isOrganizationAdmin(req.user) ? Number(req.user.managedOrganizationId) : null;
  const assetWhere = organizationId ? { department: { organizationId } } : {};
  const departmentWhere = organizationId ? { organizationId } : {};
  const userWhere = organizationId ? { department: { organizationId } } : {};
  const [
    total,
    active,
    warehouseReserve,
    broken,
    disposed,
    assigned,
    users,
    departments,
    perDepartment,
    recentAssets,
  ] = await Promise.all([
    prisma.asset.count({ where: assetWhere }),
    prisma.asset.count({ where: { ...assetWhere, status: 'ACTIVE' } }),
    prisma.asset.count({
      where: {
        ...assetWhere,
        status: 'ACTIVE',
        assignedUserId: null,
        department: { name: { equals: 'Omborxona', mode: 'insensitive' } },
      },
    }),
    prisma.asset.count({ where: { ...assetWhere, status: 'BROKEN' } }),
    prisma.asset.count({ where: { ...assetWhere, status: 'DISPOSED' } }),
    prisma.asset.count({ where: { ...assetWhere, assignedUserId: { not: null } } }),
    prisma.user.count({ where: userWhere }),
    prisma.department.count({ where: departmentWhere }),
    prisma.department.findMany({
      where: departmentWhere,
      select: { id: true, name: true, _count: { select: { assets: true } } },
      orderBy: { assets: { _count: 'desc' } },
    }),
    prisma.asset.findMany({
      where: assetWhere,
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
    warehouseReserve,
    broken,
    disposed,
    assigned,
    unassigned: total - assigned,
    users,
    departments,
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
