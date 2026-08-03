import { Router } from 'express';
import sharp from 'sharp';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { listAssets, getAsset, listAssetTypes, createAsset, updateAsset, deleteAsset, assetQr } from './assets.controller.js';
import { uploadAssetImage } from '../../middlewares/upload.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { uploadAssetExcel } from '../../middlewares/upload.js';
import { buildAssetImportTemplate, importAssets, validateAssetImport } from './assets.import.js';
const router = Router();
router.use(authenticate);
router.post('/upload-image', authorize('ADMIN','MANAGER'), uploadAssetImage.single('image'), async (req, res, next) => {
  if (!req.file) return next(new ApiError(400, 'Rasm fayli tanlanmagan'));
  try {
    const optimized = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer();
    const imageUrl = `data:image/jpeg;base64,${optimized.toString('base64')}`;
    res.status(201).json({ imageUrl });
  } catch {
    next(new ApiError(400, 'Rasm formatini qayta ishlab bo‘lmadi'));
  }
});
router.get('/import-template', authorize('ADMIN','MANAGER'), asyncHandler(async (req, res) => {
  const buffer = await buildAssetImportTemplate(req.user);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="qurilmalar-import-shabloni.xlsx"');
  res.send(Buffer.from(buffer));
}));
router.post('/import', authorize('ADMIN','MANAGER'), uploadAssetExcel.fields([
  { name: 'file', maxCount: 1 },
  { name: 'images', maxCount: 1 },
]), asyncHandler(async (req, res) => {
  const excel = req.files?.file?.[0];
  const images = req.files?.images?.[0];
  if (!excel) throw new ApiError(400, 'Excel faylini tanlang');
  if (excel.size > 15 * 1024 * 1024) throw new ApiError(400, 'Excel fayli 15 MB dan oshmasligi kerak');
  if (req.query.commit === 'true') {
    return res.status(201).json(await importAssets(excel.buffer, req.user, req.ip, images?.buffer));
  }
  const result = await validateAssetImport(excel.buffer, req.user, images?.buffer);
  res.json({
    summary: result.summary,
    errors: result.errors,
    errorsTruncated: result.errorsTruncated,
    images: result.images,
  });
}));
router.get('/', listAssets); router.get('/types', listAssetTypes); router.get('/:id', getAsset); router.get('/:id/qr', assetQr);
router.post('/', authorize('ADMIN','MANAGER'), createAsset); router.put('/:id', authorize('ADMIN','MANAGER','TECHNICIAN'), updateAsset); router.delete('/:id', authorize('ADMIN'), deleteAsset);
export default router;
