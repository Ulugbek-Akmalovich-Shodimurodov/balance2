import bcrypt from 'bcryptjs';
import { ApiError } from '../../utils/apiError.js';
import { userRepository } from './users.repository.js';
import { prisma } from '../../config/db.js';
import { auditService } from '../audit/audit.service.js';
import { isOrganizationAdmin, isSuperAdmin } from '../../middlewares/auth.js';

const normalizeIdentity = (data, required = false) => {
  const hasPassportSeries = Object.hasOwn(data, 'passportSeries');
  const hasPinfl = Object.hasOwn(data, 'pinfl');
  const passportSeries = data.passportSeries?.replace(/[\s-]/g, '').toUpperCase();
  const pinfl = data.pinfl?.replace(/\s/g, '');
  if (required && (!passportSeries || !pinfl)) {
    throw new ApiError(400, 'Pasport seria raqami va JShShIR majburiy');
  }
  if (passportSeries && !/^[A-Z]{2}\d{7}$/.test(passportSeries)) {
    throw new ApiError(400, 'Pasport seria raqami AA1234567 formatida bo‘lishi kerak');
  }
  if (pinfl && !/^\d{14}$/.test(pinfl)) {
    throw new ApiError(400, 'JShShIR 14 ta raqamdan iborat bo‘lishi kerak');
  }
  return {
    ...(hasPassportSeries ? { passportSeries: passportSeries || null } : {}),
    ...(hasPinfl ? { pinfl: pinfl || null } : {}),
  };
};

const normalizeContact = (data) => {
  for (const field of ['phone', 'servicePhone']) {
    if (Object.hasOwn(data, field)) data[field] = data[field]?.trim() || null;
  }
  if (Object.hasOwn(data, 'extensionNumber')) {
    const extensionNumber = data.extensionNumber?.trim() || null;
    if (extensionNumber && !/^\d{1,12}$/.test(extensionNumber)) {
      throw new ApiError(400, 'Ichki raqam 1–12 ta raqamdan iborat bo‘lishi kerak');
    }
    data.extensionNumber = extensionNumber;
  }
};

const validateOrganizationAssignment = async (data, currentUser = null) => {
  const departmentId = Object.hasOwn(data, 'departmentId')
    ? (data.departmentId ? Number(data.departmentId) : null)
    : currentUser?.departmentId;
  const departmentPositionId = Object.hasOwn(data, 'departmentPositionId')
    ? (data.departmentPositionId ? Number(data.departmentPositionId) : null)
    : currentUser?.departmentPositionId;
  if (!departmentPositionId) return;
  if (!departmentId) throw new ApiError(400, 'Lavozim tanlash uchun bo‘limni ham tanlang');
  const assignment = await prisma.departmentPosition.findUnique({ where: { id: departmentPositionId } });
  if (!assignment || assignment.departmentId !== departmentId) {
    throw new ApiError(400, 'Tanlangan lavozim ushbu bo‘limga tegishli emas');
  }
};

const validateManagedRole = (data) => {
  if (data.role === 'ORGANIZATION_ADMIN' && !data.managedOrganizationId) {
    throw new ApiError(400, 'Tashkilot administratori uchun tashkilotni tanlang');
  }
  if (data.role !== 'ORGANIZATION_ADMIN') data.managedOrganizationId = null;
  else data.managedOrganizationId = Number(data.managedOrganizationId);
};

const assertUserManagementScope = async (actorId, data = {}, target = null) => {
  const actor = await prisma.user.findUnique({ where: { id: Number(actorId) } });
  if (!actor) throw new ApiError(401, 'Administrator topilmadi');
  if (isSuperAdmin(actor)) return actor;
  if (!isOrganizationAdmin(actor)) throw new ApiError(403, 'Xodimlarni boshqarish uchun ruxsat yo‘q');
  if (['SUPER_ADMIN', 'ADMIN', 'ORGANIZATION_ADMIN'].includes(data.role) || ['SUPER_ADMIN', 'ADMIN', 'ORGANIZATION_ADMIN'].includes(target?.role)) {
    throw new ApiError(403, 'Tashkilot administratori administrator rollarini boshqara olmaydi');
  }
  const departmentId = data.departmentId || target?.departmentId;
  const department = departmentId ? await prisma.department.findUnique({ where: { id: Number(departmentId) } }) : null;
  if (!department || department.organizationId !== actor.managedOrganizationId) {
    throw new ApiError(403, 'Xodim faqat o‘zingiz boshqaradigan tashkilot bo‘limiga tegishli bo‘lishi kerak');
  }
  return actor;
};

export const userService = {
  list: (actor) => userRepository.list(isSuperAdmin(actor) ? {} : {
    OR: [
      { department: { organizationId: Number(actor.managedOrganizationId) } },
      { managedOrganizationId: Number(actor.managedOrganizationId) },
    ],
  }),
  get: userRepository.get,
  async create(data, actorId, ipAddress) {
    const login = data.login?.trim();
    if (!login || !data.password) throw new ApiError(400, 'Login va parol majburiy');
    if (!data.departmentId && data.role !== 'ORGANIZATION_ADMIN') throw new ApiError(400, 'Bo‘lim majburiy');
    await assertUserManagementScope(actorId, data);
    normalizeContact(data);
    validateManagedRole(data);
    await validateOrganizationAssignment(data);
    const createData = { ...data, ...normalizeIdentity(data, true), login, email: data.email || `${login}@local.invalid`, departmentId: data.departmentId ? Number(data.departmentId) : null, departmentPositionId: data.departmentPositionId ? Number(data.departmentPositionId) : null, password: await bcrypt.hash(data.password, 10) };
    return prisma.$transaction(async (tx) => {
      const item = await userRepository.create(createData, tx);
      await auditService.log(actorId, 'USER_CREATE', 'User', item.id, { objectName: item.fullName }, ipAddress, tx);
      return item;
    });
  },
  async update(id, data, actorId, ipAddress) {
    const currentUser = await prisma.user.findUnique({ where: { id: Number(id) } });
    if (!currentUser) throw new ApiError(404, 'Foydalanuvchi topilmadi');
    await assertUserManagementScope(actorId, data, currentUser);
    normalizeContact(data);
    validateManagedRole(data);
    await validateOrganizationAssignment(data, currentUser);
    Object.assign(data, normalizeIdentity(data));
    if (data.password) data.password = await bcrypt.hash(data.password, 10); else delete data.password;
    if (data.login) data.login = data.login.trim();
    data.departmentId = data.departmentId ? Number(data.departmentId) : null;
    data.departmentPositionId = data.departmentPositionId ? Number(data.departmentPositionId) : null;
    return prisma.$transaction(async (tx) => {
      const item = await userRepository.update(id, data, tx);
      await auditService.log(actorId, 'USER_UPDATE', 'User', item.id, { objectName: item.fullName }, ipAddress, tx);
      return item;
    });
  },
  async updateSelf(userId, data, ipAddress) {
    const fullName = data.fullName?.trim();
    if (!fullName || fullName.length < 3 || fullName.length > 120) {
      throw new ApiError(400, 'Ism-familiya 3 dan 120 tagacha belgidan iborat bo‘lishi kerak');
    }
    const phone = data.phone?.trim() || null;
    const servicePhone = data.servicePhone?.trim() || null;
    const extensionNumber = data.extensionNumber?.trim() || null;
    const imageUrl = data.imageUrl?.trim() || null;
    if (imageUrl && !/^data:image\/jpeg;base64,|^https:\/\//i.test(imageUrl)) {
      throw new ApiError(400, 'Profil rasmi formati noto‘g‘ri');
    }
    const updateData = {
      fullName,
      phone,
      servicePhone,
      extensionNumber,
      imageUrl,
      ...normalizeIdentity(data),
    };
    return prisma.$transaction(async (tx) => {
      const item = await userRepository.update(userId, updateData, tx);
      await auditService.log(
        userId,
        'USER_SELF_UPDATE',
        'User',
        item.id,
        { objectName: item.fullName },
        ipAddress,
        tx,
      );
      return item;
    });
  },
  async changeOwnPassword(userId, { currentPassword, newPassword }, ipAddress) {
    const user = await prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new ApiError(400, 'Joriy parol noto‘g‘ri');
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      throw new ApiError(400, 'Yangi parol joriy paroldan farq qilishi kerak');
    }
    const password = await bcrypt.hash(newPassword, 10);
    return prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: Number(userId) }, data: { password } });
      await auditService.log(
        userId,
        'USER_PASSWORD_UPDATE',
        'User',
        Number(userId),
        { objectName: user.fullName },
        ipAddress,
        tx,
      );
    });
  },
  async remove(id, actorId, ipAddress) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.user.findUnique({ where: { id: Number(id) }, select: { id:true, fullName:true } });
      if (!item) throw new ApiError(404, 'Foydalanuvchi topilmadi');
      const target = await tx.user.findUnique({ where: { id: Number(id) } });
      await assertUserManagementScope(actorId, {}, target);
      await auditService.log(actorId, 'USER_DELETE', 'User', item.id, { objectName: item.fullName }, ipAddress, tx);
      return userRepository.remove(id, tx);
    });
  },
};
