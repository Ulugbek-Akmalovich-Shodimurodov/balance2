import { Router } from 'express';
import sharp from 'sharp';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { listAssets, getAsset, listAssetTypes, createAsset, updateAsset, deleteAsset, assetQr } from './assets.controller.js';
import { uploadAssetImage } from '../../middlewares/upload.js';
import { ApiError } from '../../utils/apiError.js';
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
router.get('/', listAssets); router.get('/types', listAssetTypes); router.get('/:id', getAsset); router.get('/:id/qr', assetQr);
router.post('/', authorize('ADMIN','MANAGER'), createAsset); router.put('/:id', authorize('ADMIN','MANAGER','TECHNICIAN'), updateAsset); router.delete('/:id', authorize('ADMIN'), deleteAsset);
export default router;
