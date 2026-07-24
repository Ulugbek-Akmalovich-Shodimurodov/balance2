import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { listAssets, getAsset, listAssetTypes, createAsset, updateAsset, deleteAsset, assetQr } from './assets.controller.js';
import { uploadAssetImage } from '../../middlewares/upload.js';
import { ApiError } from '../../utils/apiError.js';
const router = Router();
router.use(authenticate);
router.post('/upload-image', authorize('ADMIN','MANAGER'), uploadAssetImage.single('image'), (req, res, next) => {
  if (!req.file) return next(new ApiError(400, 'Rasm fayli tanlanmagan'));
  const imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  res.status(201).json({ imageUrl });
});
router.get('/', listAssets); router.get('/types', listAssetTypes); router.get('/:id', getAsset); router.get('/:id/qr', assetQr);
router.post('/', authorize('ADMIN','MANAGER'), createAsset); router.put('/:id', authorize('ADMIN','MANAGER','TECHNICIAN'), updateAsset); router.delete('/:id', authorize('ADMIN'), deleteAsset);
export default router;
