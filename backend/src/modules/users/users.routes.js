import { Router } from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import { authenticate, authorizeStructureAdmin } from '../../middlewares/auth.js';
import { listUsers, getUser, createUser, updateUser, updateSelf, changeOwnPassword, deleteUser } from './users.controller.js';
import { uploadAssetImage } from '../../middlewares/upload.js';
import { uploadAssetExcel } from '../../middlewares/upload.js';
import { validate } from '../../middlewares/validate.js';
import { ApiError } from '../../utils/apiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { buildUserImportTemplate, importUsers, validateUserImport } from './users.import.js';
const router = Router();
router.use(authenticate);
const selfProfileSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(3).max(120),
    phone: z.string().trim().max(40).nullable().optional(),
    servicePhone: z.string().trim().max(40).nullable().optional(),
    extensionNumber: z.string().trim().max(12).regex(/^\d+$/, 'Ichki raqam faqat raqamlardan iborat bo‘lishi kerak').nullable().optional(),
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
router.get('/import-template', authorizeStructureAdmin, asyncHandler(async (req, res) => {
  const buffer = await buildUserImportTemplate(req.user);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="xodimlar-import-shabloni.xlsx"');
  res.send(Buffer.from(buffer));
}));
router.post('/import', authorizeStructureAdmin, uploadAssetExcel.fields([
  { name: 'file', maxCount: 1 },
  { name: 'images', maxCount: 1 },
]), asyncHandler(async (req, res) => {
  const excel = req.files?.file?.[0];
  const images = req.files?.images?.[0];
  if (!excel) throw new ApiError(400, 'Excel faylini tanlang');
  if (excel.size > 15 * 1024 * 1024) throw new ApiError(400, 'Excel fayli 15 MB dan oshmasligi kerak');
  if (req.query.commit === 'true') return res.status(201).json(await importUsers(excel.buffer, req.user, req.ip, images?.buffer));
  const result = await validateUserImport(excel.buffer, req.user, images?.buffer);
  res.json({ summary: result.summary, errors: result.errors, errorsTruncated: result.errorsTruncated, images: result.images });
}));
router.get('/', authorizeStructureAdmin, listUsers); router.get('/:id', getUser);
router.post('/', authorizeStructureAdmin, createUser); router.put('/:id', authorizeStructureAdmin, updateUser); router.delete('/:id', authorizeStructureAdmin, deleteUser);
export default router;
