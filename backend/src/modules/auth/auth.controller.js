import { authService } from './auth.service.js';
export const login = async (req, res, next) => { try { res.json(await authService.login(req.body)); } catch (e) { next(e); } };
export const me = (req, res) => res.json({ user: req.user });
export const logout = (_, res) => res.json({ message: 'Tizimdan chiqildi' });
