import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
const router=Router(); router.use(authenticate, authorize('ADMIN','MANAGER'));
router.get('/', asyncHandler(async (_,res)=>res.json(await prisma.auditLog.findMany({include:{actor:true},orderBy:{createdAt:'desc'},take:200}))));
export default router;
