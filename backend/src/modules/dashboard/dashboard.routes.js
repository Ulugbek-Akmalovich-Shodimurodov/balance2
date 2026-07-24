import { Router } from 'express';
import { prisma } from '../../config/db.js';
import { authenticate } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
const router=Router(); router.use(authenticate);
router.get('/stats', asyncHandler(async (_,res)=>{const [total,active,broken,disposed,perDepartment]=await Promise.all([prisma.asset.count(),prisma.asset.count({where:{status:'ACTIVE'}}),prisma.asset.count({where:{status:'BROKEN'}}),prisma.asset.count({where:{status:'DISPOSED'}}),prisma.department.findMany({select:{name:true,_count:{select:{assets:true}}}})]);res.json({total,active,broken,disposed,perDepartment:perDepartment.map(d=>({name:d.name,total:d._count.assets}))});}));
export default router;
