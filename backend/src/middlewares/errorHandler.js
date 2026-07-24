import { logger } from '../config/logger.js';
export function errorHandler(err, req, res, next) {
  logger.error(err.message, { stack: err.stack });
  if (err.code === 'P2002') return res.status(409).json({ message: 'Bu qiymat allaqachon mavjud' });
  if (err.code === 'P2025') return res.status(404).json({ message: 'Ma\'lumot topilmadi' });
  res.status(err.statusCode || 500).json({ message: err.message || 'Server xatosi' });
}
