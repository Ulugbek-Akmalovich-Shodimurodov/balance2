import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { ApiError } from '../utils/apiError.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const uploadsRoot = path.resolve(currentDirectory, '../../uploads');
const assetsDirectory = path.join(uploadsRoot, 'assets');
fs.mkdirSync(assetsDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: assetsDirectory,
  filename: (_, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const imageFilter = (_, file, callback) => {
  if (file.mimetype.startsWith('image/')) return callback(null, true);
  return callback(new ApiError(400, 'Faqat rasm fayllarini yuklash mumkin'));
};

export const uploadAssetImage = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });
