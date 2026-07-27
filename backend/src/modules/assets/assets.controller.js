import { assetService } from './assets.service.js';
export const listAssets = async (req,res,next)=>{try{res.json(await assetService.list({ ...req.query, assignedUserId: req.user.role === 'ADMIN' ? undefined : req.user.id }));}catch(e){next(e)}};
export const getAsset = async (req,res,next)=>{try{const asset=await assetService.get(req.params.id); if(req.user.role !== 'ADMIN' && asset.assignedUserId !== req.user.id) throw new Error('Bu qurilmani ko‘rish uchun ruxsat yo‘q'); res.json(asset);}catch(e){next(e)}};
export const listAssetTypes = async (req,res,next)=>{try{res.json(await assetService.types());}catch(e){next(e)}};
export const createAsset = async (req,res,next)=>{try{res.status(201).json(await assetService.create(req.body, req.user.id, req.ip));}catch(e){next(e)}};
export const updateAsset = async (req,res,next)=>{try{res.json(await assetService.update(req.params.id, req.body, req.user.id, req.ip));}catch(e){next(e)}};
export const deleteAsset = async (req,res,next)=>{try{await assetService.remove(req.params.id, req.user.id, req.ip);res.status(204).end();}catch(e){next(e)}};
export const assetQr = async (req,res,next)=>{try{res.json({ qr: await assetService.qr(req.params.id) });}catch(e){next(e)}};
