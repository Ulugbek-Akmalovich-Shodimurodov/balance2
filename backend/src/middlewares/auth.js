import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { ApiError } from '../utils/apiError.js';

export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next(new ApiError(401, 'Avtorizatsiya talab qilinadi'));
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const current = await prisma.user.findUnique({
      where: { id: Number(payload.id) },
      select: {
        id: true,
        login: true,
        email: true,
        fullName: true,
        role: true,
        managedOrganizationId: true,
        departmentId: true,
      },
    });
    if (!current) return next(new ApiError(401, 'Foydalanuvchi topilmadi'));
    req.user = current;
    return next();
  } catch (error) {
    return next(error instanceof ApiError ? error : new ApiError(401, 'Token yaroqsiz'));
  }
}
export const authorize = (...roles) => (req, res, next) => (
  roles.includes(req.user.role) || (roles.includes('ADMIN') && isSuperAdmin(req.user))
    ? next()
    : next(new ApiError(403, 'Ruxsat yo‘q'))
);

export const isSuperAdmin = (user) => ['SUPER_ADMIN', 'ADMIN'].includes(user?.role);
export const isOrganizationAdmin = (user) => user?.role === 'ORGANIZATION_ADMIN';
export const isStructureAdmin = (user) => isSuperAdmin(user) || isOrganizationAdmin(user);
export const isOrganizationManager = (user) => isSuperAdmin(user) || isOrganizationAdmin(user);
export const organizationIdFor = (user) => (
  isOrganizationAdmin(user) ? Number(user.managedOrganizationId) : null
);

export const authorizeOrganizationManager = (req, res, next) => (
  isOrganizationManager(req.user) ? next() : next(new ApiError(403, 'Ruxsat yo‘q'))
);

export const authorizeStructureAdmin = (req, res, next) => (
  isStructureAdmin(req.user) ? next() : next(new ApiError(403, 'Ruxsat yo‘q'))
);

export const assertOrganizationAccess = (user, organizationId) => {
  if (isSuperAdmin(user)) return;
  if (!isOrganizationAdmin(user) || Number(user.managedOrganizationId) !== Number(organizationId)) {
    throw new ApiError(403, 'Bu tashkilotni boshqarish uchun ruxsat yo‘q');
  }
};
