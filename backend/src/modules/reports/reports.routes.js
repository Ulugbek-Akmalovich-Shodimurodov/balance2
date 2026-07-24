import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../../config/db.js';
import { authenticate } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();
router.use(authenticate);

const statusLabels = {
  ACTIVE: 'Faol',
  BROKEN: 'Nosoz',
  DISPOSED: 'Foydalanishdan chiqarilgan',
};

const statusColors = {
  ACTIVE: { background: 'E8F5E9', text: '237A3B' },
  BROKEN: { background: 'FFF4CE', text: '9A6700' },
  DISPOSED: { background: 'FDECEA', text: 'B42318' },
};

const reportWhere = (query) => ({
  ...(query.status ? { status: query.status } : {}),
  ...(query.departmentId ? { departmentId: Number(query.departmentId) } : {}),
});

const reportAssets = (query) => prisma.asset.findMany({
  where: reportWhere(query),
  include: {
    assetType: { select: { name: true } },
    department: { select: { name: true } },
    assignedUser: { select: { fullName: true } },
  },
  orderBy: [{ name: 'asc' }, { inventoryNumber: 'asc' }],
});

const buildReport = async (query) => {
  const [assets, department] = await Promise.all([
    reportAssets(query),
    query.departmentId
      ? prisma.department.findUnique({
        where: { id: Number(query.departmentId) },
        select: { name: true },
      })
      : null,
  ]);
  const summary = {
    total: assets.length,
    active: assets.filter((asset) => asset.status === 'ACTIVE').length,
    broken: assets.filter((asset) => asset.status === 'BROKEN').length,
    disposed: assets.filter((asset) => asset.status === 'DISPOSED').length,
  };
  const filters = [
    `Holat: ${query.status ? statusLabels[query.status] || query.status : 'Barchasi'}`,
    `Bo‘lim: ${department?.name || 'Barchasi'}`,
  ].join('  |  ');
  return { assets, summary, filters };
};

const generatedAt = () => new Intl.DateTimeFormat('uz-UZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tashkent',
}).format(new Date());

const reportFilename = (extension) => {
  const date = new Date().toISOString().slice(0, 10);
  return `aktivlar-hisoboti-${date}.${extension}`;
};

router.get('/assets.xlsx', asyncHandler(async (req, res) => {
  const { assets, summary, filters } = await buildReport(req.query);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aktivlarni boshqarish tizimi';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = 'Aktivlar bo‘yicha professional hisobot';
  workbook.company = 'Aktivlarni boshqarish tizimi';

  const worksheet = workbook.addWorksheet('Aktivlar hisoboti', {
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    views: [{ state: 'frozen', ySplit: 9, activeCell: 'A10' }],
  });

  worksheet.columns = [
    { key: 'index', width: 8 },
    { key: 'name', width: 27 },
    { key: 'model', width: 24 },
    { key: 'inventoryNumber', width: 24 },
    { key: 'serialNumber', width: 22 },
    { key: 'status', width: 24 },
    { key: 'department', width: 24 },
    { key: 'assignedUser', width: 29 },
  ];

  worksheet.mergeCells('A1:H2');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'AKTIVLAR BO‘YICHA HISOBOT';
  titleCell.font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B57' } };

  worksheet.mergeCells('A3:H3');
  const metaCell = worksheet.getCell('A3');
  metaCell.value = `Yaratilgan vaqt: ${generatedAt()}`;
  metaCell.font = { name: 'Arial', size: 10, color: { argb: 'FF5B6B7A' }, italic: true };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  worksheet.mergeCells('A4:H4');
  const filterCell = worksheet.getCell('A4');
  filterCell.value = `Qo‘llangan filtrlar: ${filters}`;
  filterCell.font = { name: 'Arial', size: 10, color: { argb: 'FF334155' } };
  filterCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  filterCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const cards = [
    { range: 'A6:B7', label: 'JAMI AKTIVLAR', value: summary.total, color: 'FF1677FF' },
    { range: 'C6:D7', label: 'FAOL', value: summary.active, color: 'FF2E7D32' },
    { range: 'E6:F7', label: 'NOSOZ', value: summary.broken, color: 'FFF59E0B' },
    { range: 'G6:H7', label: 'CHIQARILGAN', value: summary.disposed, color: 'FFB42318' },
  ];
  cards.forEach(({ range, label, value, color }) => {
    worksheet.mergeCells(range);
    const cell = worksheet.getCell(range.split(':')[0]);
    cell.value = { richText: [
      { text: `${value}\n`, font: { name: 'Arial', size: 18, bold: true, color: { argb: 'FFFFFFFF' } } },
      { text: label, font: { name: 'Arial', size: 9, bold: true, color: { argb: 'FFEAF2F8' } } },
    ] };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: color } },
      left: { style: 'thin', color: { argb: color } },
      bottom: { style: 'thin', color: { argb: color } },
      right: { style: 'thin', color: { argb: color } },
    };
  });
  worksheet.getRow(6).height = 24;
  worksheet.getRow(7).height = 24;

  const headerRow = worksheet.getRow(9);
  headerRow.values = ['№', 'Aktiv nomi', 'Model', 'Inventar raqami', 'Seria raqami', 'Holati', 'Bo‘lim', 'Foydalanuvchi'];
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245B78' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB8C8D4' } },
      left: { style: 'thin', color: { argb: 'FFB8C8D4' } },
      bottom: { style: 'thin', color: { argb: 'FFB8C8D4' } },
      right: { style: 'thin', color: { argb: 'FFB8C8D4' } },
    };
  });

  assets.forEach((asset, index) => {
    const row = worksheet.addRow({
      index: index + 1,
      name: asset.name,
      model: asset.model || '—',
      inventoryNumber: asset.inventoryNumber,
      serialNumber: asset.serialNumber || '—',
      status: statusLabels[asset.status] || asset.status,
      department: asset.department?.name || 'Biriktirilmagan',
      assignedUser: asset.assignedUser?.fullName || 'Biriktirilmagan',
    });
    row.height = 25;
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF7FAFC' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: columnNumber === 1 ? 'center' : 'left',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFD7E0E7' } },
        left: { style: 'hair', color: { argb: 'FFD7E0E7' } },
        bottom: { style: 'hair', color: { argb: 'FFD7E0E7' } },
        right: { style: 'hair', color: { argb: 'FFD7E0E7' } },
      };
    });
    const statusCell = row.getCell(6);
    const color = statusColors[asset.status] || { background: 'F1F5F9', text: '334155' };
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.background}` } };
    statusCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: `FF${color.text}` } };
    statusCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  if (assets.length === 0) {
    worksheet.mergeCells('A10:H11');
    const emptyCell = worksheet.getCell('A10');
    emptyCell.value = 'Tanlangan filtrlarga mos aktiv topilmadi';
    emptyCell.font = { name: 'Arial', size: 12, italic: true, color: { argb: 'FF64748B' } };
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  const lastRow = Math.max(9, worksheet.lastRow.number);
  worksheet.autoFilter = { from: 'A9', to: `H${lastRow}` };
  worksheet.pageSetup.printArea = `A1:H${lastRow}`;
  worksheet.headerFooter.oddFooter = '&L Aktivlarni boshqarish tizimi&C Maxfiy xizmat hujjati&R Sahifa &P / &N';
  worksheet.headerFooter.oddHeader = '&L&B Aktivlar hisoboti&R&D &T';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${reportFilename('xlsx')}"`);
  await workbook.xlsx.write(res);
  res.end();
}));

const pdfSafe = (value) => String(value ?? '')
  .replace(/[‘’]/g, "'")
  .replace(/[–—]/g, '-');

const truncate = (value, length) => {
  const text = pdfSafe(value || '-');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

router.get('/assets.pdf', asyncHandler(async (req, res) => {
  const { assets, summary, filters } = await buildReport(req.query);
  const document = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 32,
    bufferPages: true,
    info: {
      Title: 'Aktivlar bo‘yicha hisobot',
      Author: 'Aktivlarni boshqarish tizimi',
      Subject: filters,
    },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${reportFilename('pdf')}"`);
  document.pipe(res);

  const pageWidth = document.page.width;
  const pageHeight = document.page.height;
  const left = 32;
  const contentWidth = pageWidth - 64;
  const colors = {
    navy: '#173B57',
    blue: '#245B78',
    muted: '#64748B',
    line: '#D7E0E7',
    pale: '#F1F5F9',
    white: '#FFFFFF',
  };

  const drawPageBrand = (continuation = false) => {
    document.rect(0, 0, pageWidth, continuation ? 50 : 82).fill(colors.navy);
    document.fillColor(colors.white).font('Helvetica-Bold').fontSize(continuation ? 14 : 21)
      .text(continuation ? 'AKTIVLAR HISOBOTI - DAVOMI' : 'AKTIVLAR BO‘YICHA HISOBOT', left, continuation ? 17 : 23);
    if (!continuation) {
      document.fillColor('#DCEAF3').font('Helvetica').fontSize(9)
        .text(`Yaratilgan vaqt: ${pdfSafe(generatedAt())}`, left, 53);
    }
  };

  drawPageBrand();
  document.fillColor(colors.muted).font('Helvetica').fontSize(9).text(pdfSafe(filters), left, 94);

  const cards = [
    { label: 'JAMI', value: summary.total, color: '#1677FF' },
    { label: 'FAOL', value: summary.active, color: '#2E7D32' },
    { label: 'NOSOZ', value: summary.broken, color: '#D99100' },
    { label: 'CHIQARILGAN', value: summary.disposed, color: '#B42318' },
  ];
  const cardGap = 10;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  cards.forEach((card, index) => {
    const x = left + index * (cardWidth + cardGap);
    document.roundedRect(x, 116, cardWidth, 48, 6).fill(card.color);
    document.fillColor(colors.white).font('Helvetica-Bold').fontSize(16)
      .text(String(card.value), x + 12, 125, { width: cardWidth - 24 });
    document.fillColor('#F4F8FB').font('Helvetica-Bold').fontSize(8)
      .text(card.label, x + 12, 146, { width: cardWidth - 24 });
  });

  const columns = [
    { label: '#', key: 'index', width: 28, align: 'center' },
    { label: 'AKTIV NOMI', key: 'name', width: 108 },
    { label: 'MODEL', key: 'model', width: 94 },
    { label: 'INVENTAR RAQAMI', key: 'inventoryNumber', width: 112 },
    { label: 'SERIA RAQAMI', key: 'serialNumber', width: 96 },
    { label: 'HOLATI', key: 'status', width: 78, align: 'center' },
    { label: "BO'LIM", key: 'department', width: 105 },
    { label: 'FOYDALANUVCHI', key: 'assignedUser', width: contentWidth - 621 },
  ];

  const drawTableHeader = (y) => {
    document.rect(left, y, contentWidth, 28).fill(colors.blue);
    let x = left;
    columns.forEach((column) => {
      document.fillColor(colors.white).font('Helvetica-Bold').fontSize(7.5)
        .text(column.label, x + 5, y + 9, {
          width: column.width - 10,
          align: column.align || 'left',
          lineBreak: false,
        });
      x += column.width;
    });
    return y + 28;
  };

  let y = drawTableHeader(180);
  if (assets.length === 0) {
    document.rect(left, y, contentWidth, 50).fill('#F8FAFC');
    document.fillColor(colors.muted).font('Helvetica-Oblique').fontSize(11)
      .text('Tanlangan filtrlarga mos aktiv topilmadi', left, y + 18, { width: contentWidth, align: 'center' });
  }

  assets.forEach((asset, index) => {
    const rowHeight = 32;
    if (y + rowHeight > pageHeight - 48) {
      document.addPage();
      drawPageBrand(true);
      y = drawTableHeader(62);
    }
    document.rect(left, y, contentWidth, rowHeight).fill(index % 2 === 0 ? colors.white : '#F7FAFC');
    document.moveTo(left, y + rowHeight).lineTo(left + contentWidth, y + rowHeight)
      .strokeColor(colors.line).lineWidth(0.5).stroke();

    const row = {
      index: index + 1,
      name: truncate(asset.name, 24),
      model: truncate(asset.model, 20),
      inventoryNumber: truncate(asset.inventoryNumber, 24),
      serialNumber: truncate(asset.serialNumber, 20),
      status: statusLabels[asset.status] || asset.status,
      department: truncate(asset.department?.name || 'Biriktirilmagan', 22),
      assignedUser: truncate(asset.assignedUser?.fullName || 'Biriktirilmagan', 28),
    };
    let x = left;
    columns.forEach((column) => {
      if (column.key === 'status') {
        const statusColor = statusColors[asset.status] || { background: 'F1F5F9', text: '334155' };
        document.roundedRect(x + 5, y + 7, column.width - 10, 18, 8).fill(`#${statusColor.background}`);
        document.fillColor(`#${statusColor.text}`).font('Helvetica-Bold').fontSize(7)
          .text(pdfSafe(row[column.key]), x + 7, y + 12, {
            width: column.width - 14,
            align: 'center',
            lineBreak: false,
          });
      } else {
        document.fillColor('#1F2937').font(column.key === 'name' ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
          .text(pdfSafe(row[column.key]), x + 5, y + 11, {
            width: column.width - 10,
            align: column.align || 'left',
            lineBreak: false,
          });
      }
      x += column.width;
    });
    y += rowHeight;
  });

  const range = document.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    document.switchToPage(pageIndex);
    document.moveTo(left, pageHeight - 50).lineTo(pageWidth - left, pageHeight - 50)
      .strokeColor(colors.line).lineWidth(0.5).stroke();
    document.fillColor(colors.muted).font('Helvetica').fontSize(8)
      .text('Aktivlarni boshqarish tizimi', left, pageHeight - 43);
    document.text(`Sahifa ${pageIndex + 1} / ${range.count}`, pageWidth - 130, pageHeight - 43, {
      width: 98,
      align: 'right',
    });
  }

  document.end();
}));

export default router;
