import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('Admin123!', 10);
  const admin = await prisma.user.upsert({ where: { email: 'admin@example.com' }, update: { login: 'admin', role: 'SUPER_ADMIN' }, create: { fullName: 'Administrator', email: 'admin@example.com', login: 'admin', password, role: 'SUPER_ADMIN' } });
  const it = await prisma.department.upsert({ where: { id: 1 }, update: {}, create: { name: 'IT bo‘limi' } });
  const laptop = await prisma.assetType.upsert({ where: { name: 'Noutbuk' }, update: {}, create: { name: 'Noutbuk' } });
  await prisma.asset.upsert({ where: { inventoryNumber: 'INV-0001' }, update: {}, create: { name: 'Dell Latitude', inventoryNumber: 'INV-0001', serialNumber: 'SN123456', assetTypeId: laptop.id, departmentId: it.id, assignedUserId: admin.id, purchaseDate: new Date() } });
}
main().finally(() => prisma.$disconnect());
