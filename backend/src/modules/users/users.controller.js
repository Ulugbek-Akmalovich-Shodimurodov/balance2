import { userService } from './users.service.js';
import { ApiError } from '../../utils/apiError.js';
export const listUsers = async (_, res, next) => { try { res.json(await userService.list()); } catch(e){ next(e); } };
export const getUser = async (req, res, next) => { try { if (req.user.role !== 'ADMIN' && req.user.id !== Number(req.params.id)) throw new ApiError(403, 'Faqat o‘z profilingizni ko‘rishingiz mumkin'); res.json(await userService.get(req.params.id)); } catch(e){ next(e); } };
export const createUser = async (req, res, next) => { try { res.status(201).json(await userService.create(req.body, req.user.id, req.ip)); } catch(e){ next(e); } };
export const updateUser = async (req, res, next) => { try { res.json(await userService.update(req.params.id, req.body, req.user.id, req.ip)); } catch(e){ next(e); } };
export const updateSelf = async (req, res, next) => { try { res.json(await userService.updateSelf(req.user.id, req.validated.body, req.ip)); } catch(e){ next(e); } };
export const changeOwnPassword = async (req, res, next) => { try { await userService.changeOwnPassword(req.user.id, req.validated.body, req.ip); res.json({ message: 'Parol muvaffaqiyatli yangilandi' }); } catch(e){ next(e); } };
export const deleteUser = async (req, res, next) => { try { await userService.remove(req.params.id, req.user.id, req.ip); res.status(204).end(); } catch(e){ next(e); } };
