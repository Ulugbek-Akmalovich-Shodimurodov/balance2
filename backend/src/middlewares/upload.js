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

const excelFilter = (_, file, callback) => {
  const valid = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || file.originalname?.toLowerCase().endsWith('.xlsx');
  return valid
    ? callback(null, true)
    : callback(new ApiError(400, 'Faqat .xlsx formatidagi Excel faylini yuklash mumkin'));
};

export const uploadAssetExcel = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_, file, callback) => {
    if (file.fieldname === 'file') return excelFilter(_, file, callback);
    const validZip = file.fieldname === 'images'
      && (file.mimetype === 'application/zip'
        || file.mimetype === 'application/x-zip-compressed'
        || file.originalname?.toLowerCase().endsWith('.zip'));
    return validZip
      ? callback(null, true)
      : callback(new ApiError(400, 'Rasmlar faqat .zip formatida yuklanadi'));
  },
  limits: { fileSize: 100 * 1024 * 1024, files: 2 },
});
