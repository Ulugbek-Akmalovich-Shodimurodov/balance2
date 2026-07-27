import bcrypt from 'bcryptjs';
import { ApiError } from '../../utils/apiError.js';
import { userRepository } from './users.repository.js';
import { prisma } from '../../config/db.js';
import { auditService } from '../audit/audit.service.js';

export const userService = {
  list: userRepository.list,
  get: userRepository.get,
  async create(data, actorId, ipAddress) {
    const login = data.login?.trim();
    if (!login || !data.password) throw new ApiError(400, 'Login va parol majburiy');
    const createData = { ...data, login, email: data.email || `${login}@local.invalid`, departmentId: data.departmentId ? Number(data.departmentId) : null, password: await bcrypt.hash(data.password, 10) };
    return prisma.$transaction(async (tx) => {
      const item = await userRepository.create(createData, tx);
      await auditService.log(actorId, 'USER_CREATE', 'User', item.id, { objectName: item.fullName }, ipAddress, tx);
      return item;
    });
  },
  async update(id, data, actorId, ipAddress) {
    if (data.password) data.password = await bcrypt.hash(data.password, 10); else delete data.password;
    if (data.login) data.login = data.login.trim();
    data.departmentId = data.departmentId ? Number(data.departmentId) : null;
    return prisma.$transaction(async (tx) => {
      const item = await userRepository.update(id, data, tx);
      await auditService.log(actorId, 'USER_UPDATE', 'User', item.id, { objectName: item.fullName }, ipAddress, tx);
      return item;
    });
  },
  async remove(id, actorId, ipAddress) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.user.findUnique({ where: { id: Number(id) }, select: { id:true, fullName:true } });
      if (!item) throw new ApiError(404, 'Foydalanuvchi topilmadi');
      await auditService.log(actorId, 'USER_DELETE', 'User', item.id, { objectName: item.fullName }, ipAddress, tx);
      return userRepository.remove(id, tx);
    });
  },
};
