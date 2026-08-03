import { assetService } from './assets.service.js';
import { isOrganizationAdmin, isSuperAdmin } from '../../middlewares/auth.js';
import { ApiError } from '../../utils/apiError.js';
const assertAssetScope = (user, asset) => {
  if (isSuperAdmin(user)) return;
  if (isOrganizationAdmin(user) && Number(asset.department?.organizationId) === Number(user.managedOrganizationId)) return;
  if (asset.assignedUserId === user.id) return;
  throw new ApiError(403, 'Bu qurilma uchun ruxsat yo‘q');
};
const assertDepartmentScope = async (user, departmentId) => {
  if (isSuperAdmin(user)) return;
  const department = departmentId ? await assetService.department(departmentId) : null;
  if (!isOrganizationAdmin(user) || Number(department?.organizationId) !== Number(user.managedOrganizationId)) {
    throw new ApiError(403, 'Qurilma faqat boshqaruvingizdagi tashkilot bo‘limiga tegishli bo‘lishi mumkin');
  }
};
export const listAssets = async (req,res,next)=>{try{res.json(await assetService.list({ ...req.query, ...(isOrganizationAdmin(req.user) ? { organizationId:req.user.managedOrganizationId, assignedUserId:req.query.mine==='true'?req.user.id:undefined } : { assignedUserId:isSuperAdmin(req.user)?undefined:req.user.id }) }));}catch(e){next(e)}};
export const getAsset = async (req,res,next)=>{try{const asset=await assetService.get(req.params.id); assertAssetScope(req.user, asset); res.json(asset);}catch(e){next(e)}};
export const listAssetTypes = async (req,res,next)=>{try{res.json(await assetService.types());}catch(e){next(e)}};
export const createAsset = async (req,res,next)=>{try{await assertDepartmentScope(req.user, req.body.departmentId);res.status(201).json(await assetService.create(req.body, req.user.id, req.ip));}catch(e){next(e)}};
export const updateAsset = async (req,res,next)=>{try{const current=await assetService.get(req.params.id);assertAssetScope(req.user,current);if(req.body.departmentId)await assertDepartmentScope(req.user,req.body.departmentId);res.json(await assetService.update(req.params.id, req.body, req.user.id, req.ip));}catch(e){next(e)}};
export const deleteAsset = async (req,res,next)=>{try{const current=await assetService.get(req.params.id);assertAssetScope(req.user,current);await assetService.remove(req.params.id, req.user.id, req.ip);res.status(204).end();}catch(e){next(e)}};
export const assetQr = async (req,res,next)=>{try{res.json({ qr: await assetService.qr(req.params.id) });}catch(e){next(e)}};
