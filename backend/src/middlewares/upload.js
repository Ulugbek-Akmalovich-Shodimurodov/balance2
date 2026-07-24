import multer from 'multer';
import { ApiError } from '../utils/apiError.js';

const imageFilter = (_, file, callback) => {
  if (file.mimetype.startsWith('image/')) return callback(null, true);
  return callback(new ApiError(400, 'Faqat rasm fayllarini yuklash mumkin'));
};

export const uploadAssetImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});
