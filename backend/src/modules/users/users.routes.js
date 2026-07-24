import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { listUsers, getUser, createUser, updateUser, deleteUser } from './users.controller.js';
const router = Router();
router.use(authenticate);
router.get('/', authorize('ADMIN','MANAGER'), listUsers); router.get('/:id', getUser);
router.post('/', authorize('ADMIN'), createUser); router.put('/:id', authorize('ADMIN'), updateUser); router.delete('/:id', authorize('ADMIN'), deleteUser);
export default router;
