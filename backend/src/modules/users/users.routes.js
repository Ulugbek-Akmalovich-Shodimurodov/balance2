import { Router } from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { listUsers, getUser, createUser, updateUser, updateSelf, changeOwnPassword, deleteUser } from './users.controller.js';
import { uploadAssetImage } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { ApiError } from '../../utils/apiError.js';
const router = Router();
router.use(authenticate);
const selfProfileSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(3).max(120),
    phone: z.string().trim().max(40).nullable().optional(),
    passportSeries: z.string().trim().regex(/^[A-Za-z]{2}\d{7}$/, 'Pasport seria raqami AA1234567 formatida bo‘lishi kerak').nullable().optional(),
    pinfl: z.string().trim().regex(/^\d{14}$/, 'JShShIR 14 ta raqamdan iborat bo‘lishi kerak').nullable().optional(),
    imageUrl: z.string().max(2_500_000).nullable().optional(),
  }).strict(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});
const passwordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8, 'Yangi parol kamida 8 belgidan iborat bo‘lishi kerak').max(128),
  }).strict(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});
router.patch('/me', validate(selfProfileSchema), updateSelf);
router.patch('/me/password', validate(passwordSchema), changeOwnPassword);
router.post('/me/upload-image', uploadAssetImage.single('image'), async (req, res, next) => {
  if (!req.file) return next(new ApiError(400, 'Rasm fayli tanlanmagan'));
  try {
    const optimized = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 512, height: 512, fit: 'cover', position: 'centre', withoutEnlargement: true })
      .jpeg({ quality: 84, progressive: true })
      .toBuffer();
    res.status(201).json({ imageUrl: `data:image/jpeg;base64,${optimized.toString('base64')}` });
  } catch {
    next(new ApiError(400, 'Rasm formatini qayta ishlab bo‘lmadi'));
  }
});
router.get('/', authorize('ADMIN','MANAGER'), listUsers); router.get('/:id', getUser);
router.post('/', authorize('ADMIN'), createUser); router.put('/:id', authorize('ADMIN'), updateUser); router.delete('/:id', authorize('ADMIN'), deleteUser);
export default router;
