import { prisma } from '../../config/db.js';

const publicUser = { id:true, fullName:true, login:true, phone:true, imageUrl:true, role:true, department:true, createdAt:true };

export const userRepository = {
  findByLogin: (identifier) => prisma.user.findFirst({ where: { OR: [{ login: identifier }, { email: identifier }] } }),
  list: () => prisma.user.findMany({ select: publicUser, orderBy: { fullName: 'asc' } }),
  get: async (id) => {
    const userId = Number(id);
    const [user, history] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { ...publicUser, assets: { include: { department: true }, orderBy: { name: 'asc' } } } }),
      prisma.transaction.findMany({
        where: { OR: [{ userId }, { fromUserId: userId }] },
        include: {
          asset: { select: { id:true, name:true, model:true, inventoryNumber:true, imageUrl:true } },
          user: { select: { id:true, fullName:true } },
          fromUser: { select: { id:true, fullName:true } },
          fromDepartment: { select: { name:true } },
          toDepartment: { select: { name:true } },
          actor: { select: { fullName:true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return user ? { ...user, history } : null;
  },
  create: (data) => prisma.user.create({ data, select: publicUser }),
  update: (id, data) => prisma.user.update({ where: { id:Number(id) }, data, select: publicUser }),
  remove: (id) => prisma.user.delete({ where: { id:Number(id) } }),
};
