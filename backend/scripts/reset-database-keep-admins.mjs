import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const confirmed = process.argv.includes('--confirm');

const getState = async () => {
  const [admins, users, departments, assetTypes, assets, transactions, maintenanceLogs, auditLogs, deliveryActs] =
    await Promise.all([
      prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true, fullName: true, login: true },
        orderBy: { id: 'asc' },
      }),
      prisma.user.count(),
      prisma.department.count(),
      prisma.assetType.count(),
      prisma.asset.count(),
      prisma.transaction.count(),
      prisma.maintenanceLog.count(),
      prisma.auditLog.count(),
      prisma.deliveryAct.count(),
    ]);

  return {
    admins,
    counts: {
      users,
      nonAdminUsers: users - admins.length,
      departments,
      assetTypes,
      assets,
      transactions,
      maintenanceLogs,
      auditLogs,
      deliveryActs,
    },
  };
};

try {
  const before = await getState();
  console.log(JSON.stringify({ mode: confirmed ? 'confirm' : 'dry-run', before }, null, 2));

  if (!confirmed) {
    process.exitCode = 2;
  } else if (before.admins.length === 0) {
    throw new Error('ADMIN rolidagi foydalanuvchi topilmadi. Tozalash bekor qilindi.');
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.deliveryAct.deleteMany();
      await tx.transaction.deleteMany();
      await tx.maintenanceLog.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.asset.deleteMany();
      await tx.assetType.deleteMany();
      await tx.user.updateMany({
        where: { role: 'ADMIN' },
        data: { departmentId: null },
      });
      await tx.user.deleteMany({
        where: { role: { not: 'ADMIN' } },
      });
      await tx.department.deleteMany();
    });

    const after = await getState();
    console.log(JSON.stringify({ completed: true, after }, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
