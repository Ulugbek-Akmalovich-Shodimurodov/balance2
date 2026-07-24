import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { captcha, login, me, logout } from './auth.controller.js';
import { authenticate } from '../../middlewares/auth.js';
import { validate } from '../../middlewares/validate.js';
const router = Router();

const captchaLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Juda ko‘p CAPTCHA so‘rovi. Biroz kuting.' },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Kirish urinishlari juda ko‘p. 15 daqiqadan keyin qayta urinib ko‘ring.' },
});
const loginSchema = z.object({
  body: z.object({
    login: z.string()
      .trim()
      .min(3, 'Login kamida 3 belgidan iborat bo‘lsin')
      .max(80, 'Login juda uzun')
      .regex(/^[A-Za-z0-9._@+-]+$/, 'Login tarkibida ruxsat etilmagan belgilar bor'),
    password: z.string().min(1, 'Parol majburiy').max(128, 'Parol juda uzun'),
    captchaToken: z.string().min(20).max(2048),
    captchaAnswer: z.string().trim().regex(/^[A-Za-z0-9]{5}$/, 'CAPTCHA 5 ta belgidan iborat'),
  }).strict(),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

router.get('/captcha', captchaLimiter, captcha);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', authenticate, me);
export default router;
