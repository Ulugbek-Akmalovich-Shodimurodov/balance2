import { authService } from './auth.service.js';
import { captchaService } from './captcha.service.js';
export const captcha = (_, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.json(captchaService.create());
};
export const login = async (req, res, next) => { try { res.json(await authService.login(req.validated.body)); } catch (e) { next(e); } };
export const me = (req, res) => res.json({ user: req.user });
export const logout = (_, res) => res.json({ message: 'Tizimdan chiqildi' });
