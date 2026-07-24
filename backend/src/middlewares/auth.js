import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

export function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next(new ApiError(401, 'Avtorizatsiya talab qilinadi'));
  try { req.user = jwt.verify(token, env.jwtSecret); next(); } catch { next(new ApiError(401, 'Token yaroqsiz')); }
}
export const authorize = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : next(new ApiError(403, 'Ruxsat yo‘q'));
