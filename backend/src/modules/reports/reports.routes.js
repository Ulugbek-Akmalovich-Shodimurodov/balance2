import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../../config/db.js';
import { authenticate } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate);

const reportWhere = (query) => ({
  ...(query.status ? { status: query.status } : {}),
  ...(query.departmentId ? { departmentId: Number(query.departmentId) } : {}),
});

const reportAssets = (query) => prisma.asset.findMany({
  where: reportWhere(query),
  include: { department: { select: { name: true } }, assignedUser: { select: { fullName: true } } },
  orderBy: { name: 'asc' },
});

router.get('/assets.xlsx', asyncHandler(async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Aktivlar');
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Nomi', key: 'name', width: 28 },
    { header: 'Model', key: 'model', width: 24 },
    { header: 'Inventar raqami', key: 'inventoryNumber', width: 24 },
    { header: 'Seria raqami', key: 'serialNumber', width: 24 },
    { header: 'Holati', key: 'status', width: 18 },
    { header: 'Bo‘lim', key: 'department', width: 26 },
    { header: 'Foydalanuvchi', key: 'assignedUser', width: 28 },
  ];
  (await reportAssets(req.query)).forEach((asset) => worksheet.addRow({
    ...asset,
    department: asset.department?.name || '',
    assignedUser: asset.assignedUser?.fullName || '',
  }));
  worksheet.getRow(1).font = { bold: true };
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=assets.xlsx');
  await workbook.xlsx.write(res);
  res.end();
}));

router.get('/assets.pdf', asyncHandler(async (req, res) => {
  const document = new PDFDocument({ margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=assets.pdf');
  document.pipe(res);
  document.fontSize(18).text('Aktivlar hisoboti');
  document.moveDown();
  for (const asset of await reportAssets(req.query)) {
    document.fontSize(10).text(
      `${asset.id}. ${asset.name} | ${asset.model || '—'} | ${asset.inventoryNumber} | ${asset.status} | ${asset.department?.name || '—'}`
    );
  }
  document.end();
}));

export default router;
