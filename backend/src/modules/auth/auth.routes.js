import { Router } from 'express';
import { login, me, logout } from './auth.controller.js';
import { authenticate } from '../../middlewares/auth.js';
const router = Router();
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticate, me);
export default router;
