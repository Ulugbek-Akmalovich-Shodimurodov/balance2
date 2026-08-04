import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../../config/db.js';
import { authenticate, isOrganizationAdmin, isSuperAdmin } from '../../middlewares/auth.js';
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

const selectedDepartmentIds = (query) => String(query.departmentIds || query.departmentId || '')
  .split(',')
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value > 0);

const reportWhere = (query, user) => ({
  ...(query.status ? { status: query.status } : {}),
  ...(isOrganizationAdmin(user) ? { department: { organizationId: Number(user.managedOrganizationId) } } : {}),
  ...(!isSuperAdmin(user) && !isOrganizationAdmin(user) ? { assignedUserId: user.id } : {}),
  ...(selectedDepartmentIds(query).length
    ? { departmentId: { in: selectedDepartmentIds(query) } }
    : {}),
});

const reportAssets = (query, user) => prisma.asset.findMany({
  where: reportWhere(query, user),
  include: {
    assetType: { select: { name: true } },
    department: { select: { name: true } },
    assignedUser: { select: { fullName: true } },
  },
  orderBy: [{ name: 'asc' }, { inventoryNumber: 'asc' }],
});

const buildReport = async (query, user) => {
  const departmentIds = selectedDepartmentIds(query);
  const [assets, departments] = await Promise.all([
    reportAssets(query, user),
    departmentIds.length
      ? prisma.department.findMany({
        where: {
          id: { in: departmentIds },
          ...(isOrganizationAdmin(user) ? { organizationId: Number(user.managedOrganizationId) } : {}),
        },
        select: { name: true },
        orderBy: { name: 'asc' },
      })
      : [],
  ]);
  const summary = {
    total: assets.length,
    active: assets.filter((asset) => asset.status === 'ACTIVE').length,
    broken: assets.filter((asset) => asset.status === 'BROKEN').length,
    disposed: assets.filter((asset) => asset.status === 'DISPOSED').length,
  };
  const filters = [
    `Holat: ${query.status ? statusLabels[query.status] || query.status : 'Barchasi'}`,
    `Bo‘limlar: ${departments.length ? departments.map((department) => department.name).join(', ') : 'Barchasi'}`,
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

const loadReportImage = async (imageUrl) => {
  if (!imageUrl) return null;
  try {
    if (imageUrl.startsWith('data:')) {
      const match = imageUrl.match(/^data:(image\/(?:png|jpe?g|gif));base64,(.+)$/i);
      if (!match) return null;
      return {
        buffer: Buffer.from(match[2], 'base64'),
        extension: match[1].toLowerCase().includes('png')
          ? 'png'
          : match[1].toLowerCase().includes('gif')
            ? 'gif'
            : 'jpeg',
      };
    }
    if (!/^https:\/\//i.test(imageUrl)) return null;
    const response = await fetch(imageUrl, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    const extension = contentType.includes('png')
      ? 'png'
      : contentType.includes('gif')
        ? 'gif'
        : contentType.includes('jpeg') || contentType.includes('jpg')
          ? 'jpeg'
          : null;
    if (!extension) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length <= 2 * 1024 * 1024 ? { buffer, extension } : null;
  } catch {
    return null;
  }
};

const loadReportImages = async (assets) => {
  const cache = new Map();
  await Promise.all([...new Set(assets.map((asset) => asset.imageUrl).filter(Boolean))]
    .map(async (url) => cache.set(url, await loadReportImage(url))));
  return new Map(assets.map((asset) => [asset.id, cache.get(asset.imageUrl) || null]));
};

router.get('/assets.xlsx', asyncHandler(async (req, res) => {
  const { assets, summary, filters } = await buildReport(req.query, req.user);
  const images = await loadReportImages(assets);
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
    { key: 'image', width: 12 },
    { key: 'name', width: 25 },
    { key: 'model', width: 24 },
    { key: 'inventoryNumber', width: 24 },
    { key: 'manufactureYear', width: 12 },
    { key: 'status', width: 24 },
    { key: 'department', width: 24 },
    { key: 'assignedUser', width: 29 },
  ];

  worksheet.mergeCells('A1:I2');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'AKTIVLAR BO‘YICHA HISOBOT';
  titleCell.font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B57' } };

  worksheet.mergeCells('A3:I3');
  const metaCell = worksheet.getCell('A3');
  metaCell.value = `Yaratilgan vaqt: ${generatedAt()}`;
  metaCell.font = { name: 'Arial', size: 10, color: { argb: 'FF5B6B7A' }, italic: true };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  worksheet.mergeCells('A4:I4');
  const filterCell = worksheet.getCell('A4');
  filterCell.value = `Qo‘llangan filtrlar: ${filters}`;
  filterCell.font = { name: 'Arial', size: 10, color: { argb: 'FF334155' } };
  filterCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  filterCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const cards = [
    { range: 'A6:B7', label: 'JAMI AKTIVLAR', value: summary.total, color: 'FF1677FF' },
    { range: 'C6:D7', label: 'FAOL', value: summary.active, color: 'FF2E7D32' },
    { range: 'E6:F7', label: 'NOSOZ', value: summary.broken, color: 'FFF59E0B' },
    { range: 'G6:I7', label: 'CHIQARILGAN', value: summary.disposed, color: 'FFB42318' },
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
  headerRow.values = ['№', 'Rasm', 'Aktiv nomi', 'Model', 'Inventar raqami', 'Yili', 'Holati', 'Bo‘lim', 'Foydalanuvchi'];
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
      image: '',
      name: asset.name,
      model: asset.model || '—',
      inventoryNumber: asset.inventoryNumber,
      manufactureYear: asset.manufactureYear || '—',
      status: statusLabels[asset.status] || asset.status,
      department: asset.department?.name || 'Biriktirilmagan',
      assignedUser: asset.assignedUser?.fullName || 'Biriktirilmagan',
    });
    row.height = 48;
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
    const reportImage = images.get(asset.id);
    if (reportImage) {
      const imageId = workbook.addImage({
        buffer: reportImage.buffer,
        extension: reportImage.extension,
      });
      worksheet.addImage(imageId, {
        tl: { col: 1.15, row: row.number - 0.88 },
        ext: { width: 42, height: 42 },
        editAs: 'oneCell',
      });
    } else {
      const imageCell = row.getCell(2);
      imageCell.value = 'Rasm yo‘q';
      imageCell.font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF94A3B8' } };
      imageCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
    const statusCell = row.getCell(7);
    const color = statusColors[asset.status] || { background: 'F1F5F9', text: '334155' };
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.background}` } };
    statusCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: `FF${color.text}` } };
    statusCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  if (assets.length === 0) {
    worksheet.mergeCells('A10:I11');
    const emptyCell = worksheet.getCell('A10');
    emptyCell.value = 'Tanlangan filtrlarga mos aktiv topilmadi';
    emptyCell.font = { name: 'Arial', size: 12, italic: true, color: { argb: 'FF64748B' } };
    emptyCell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  const lastRow = Math.max(9, worksheet.lastRow.number);
  worksheet.autoFilter = { from: 'A9', to: `I${lastRow}` };
  worksheet.pageSetup.printArea = `A1:I${lastRow}`;
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
  const { assets, summary, filters } = await buildReport(req.query, req.user);
  const images = await loadReportImages(assets);
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
    { label: 'RASM', key: 'image', width: 54, align: 'center' },
    { label: 'AKTIV NOMI', key: 'name', width: 90 },
    { label: 'MODEL', key: 'model', width: 82 },
    { label: 'INVENTAR RAQAMI', key: 'inventoryNumber', width: 100 },
    { label: 'YILI', key: 'manufactureYear', width: 48 },
    { label: 'HOLATI', key: 'status', width: 76, align: 'center' },
    { label: "BO'LIM", key: 'department', width: 95 },
    { label: 'FOYDALANUVCHI', key: 'assignedUser', width: contentWidth - 609 },
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
    const rowHeight = 46;
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
      image: '',
      name: truncate(asset.name, 24),
      model: truncate(asset.model, 20),
      inventoryNumber: truncate(asset.inventoryNumber, 24),
      manufactureYear: asset.manufactureYear || '—',
      status: statusLabels[asset.status] || asset.status,
      department: truncate(asset.department?.name || 'Biriktirilmagan', 22),
      assignedUser: truncate(asset.assignedUser?.fullName || 'Biriktirilmagan', 28),
    };
    let x = left;
    columns.forEach((column) => {
      if (column.key === 'image') {
        const reportImage = images.get(asset.id);
        if (reportImage && ['jpeg', 'png'].includes(reportImage.extension)) {
          try {
            document.image(reportImage.buffer, x + 9, y + 5, {
              fit: [36, 36],
              align: 'center',
              valign: 'center',
            });
          } catch {
            document.roundedRect(x + 10, y + 8, 34, 30, 4).fill(colors.pale);
            document.fillColor(colors.muted).font('Helvetica').fontSize(6)
              .text('Rasm yoq', x + 11, y + 20, { width: 32, align: 'center' });
          }
        } else {
          document.roundedRect(x + 10, y + 8, 34, 30, 4).fill(colors.pale);
          document.fillColor(colors.muted).font('Helvetica').fontSize(6)
            .text('Rasm yoq', x + 11, y + 20, { width: 32, align: 'center' });
        }
      } else if (column.key === 'status') {
        const statusColor = statusColors[asset.status] || { background: 'F1F5F9', text: '334155' };
        document.roundedRect(x + 5, y + 14, column.width - 10, 18, 8).fill(`#${statusColor.background}`);
        document.fillColor(`#${statusColor.text}`).font('Helvetica-Bold').fontSize(7)
          .text(pdfSafe(row[column.key]), x + 7, y + 19, {
            width: column.width - 14,
            align: 'center',
            lineBreak: false,
          });
      } else {
        document.fillColor('#1F2937').font(column.key === 'name' ? 'Helvetica-Bold' : 'Helvetica').fontSize(8)
          .text(pdfSafe(row[column.key]), x + 5, y + 18, {
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

const maintenanceLabels = {
  NEW: 'Yangi so‘rov',
  IN_PROGRESS: 'Jarayonda',
  REPAIRED: 'Tuzatildi',
  REPLACED: 'Almashtirildi',
  WAREHOUSED: 'Omborxonada',
};

const maintenanceColors = {
  NEW: { background: 'FDECEA', text: 'B42318' },
  IN_PROGRESS: { background: 'FFF4CE', text: '9A6700' },
  REPAIRED: { background: 'E8F5E9', text: '237A3B' },
  REPLACED: { background: 'E8F1FD', text: '175CD3' },
  WAREHOUSED: { background: 'F3E8FF', text: '7E22CE' },
};

const maintenanceReport = async (query, user) => {
  const search = String(query.search || '').trim();
  const accessAssetFilter = isSuperAdmin(user)
    ? {}
    : isOrganizationAdmin(user)
      ? { department: { organizationId: Number(user.managedOrganizationId) } }
      : { assignedUserId: user.id };
  const where = {
    ...(!isSuperAdmin(user) ? { asset: accessAssetFilter } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.departmentId ? { asset: { departmentId: Number(query.departmentId), ...accessAssetFilter } } : {}),
    ...(query.assetStatus ? { asset: {
      status: query.assetStatus,
      ...(query.departmentId ? { departmentId: Number(query.departmentId) } : {}),
      ...accessAssetFilter,
    } } : {}),
    ...(search ? {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { asset: { name: { contains: search, mode: 'insensitive' } } },
        { asset: { model: { contains: search, mode: 'insensitive' } } },
        { asset: { inventoryNumber: { contains: search, mode: 'insensitive' } } },
        ...(/^\d{4}$/.test(search) ? [{ asset: { manufactureYear: Number(search) } }] : []),
        { asset: { assignedUser: { fullName: { contains: search, mode: 'insensitive' } } } },
      ],
    } : {}),
  };
  const [logs, department] = await Promise.all([
    prisma.maintenanceLog.findMany({
      where,
      include: {
        asset: {
          include: {
            department: { select: { name: true } },
            assignedUser: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    query.departmentId
      ? prisma.department.findUnique({ where: { id: Number(query.departmentId) }, select: { name: true } })
      : null,
  ]);
  const summary = {
    total: logs.length,
    open: logs.filter((log) => ['NEW', 'IN_PROGRESS'].includes(log.status)).length,
    repaired: logs.filter((log) => log.status === 'REPAIRED').length,
    replaced: logs.filter((log) => ['REPLACED', 'WAREHOUSED'].includes(log.status)).length,
  };
  const filters = [
    `Jarayon: ${query.status ? maintenanceLabels[query.status] || query.status : 'Barchasi'}`,
    `Bo‘lim: ${department?.name || 'Barchasi'}`,
    `Qurilma holati: ${query.assetStatus ? statusLabels[query.assetStatus] || query.assetStatus : 'Barchasi'}`,
    `Qidiruv: ${search || 'Yo‘q'}`,
  ].join('  |  ');
  return { logs, summary, filters };
};

const maintenanceFilename = (extension) => (
  `texnik-xizmat-hisoboti-${new Date().toISOString().slice(0, 10)}.${extension}`
);

router.get('/maintenance.xlsx', asyncHandler(async (req, res) => {
  const { logs, summary, filters } = await maintenanceReport(req.query, req.user);
  const images = await loadReportImages(logs.map((log) => log.asset));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aktivlarni boshqarish tizimi';
  workbook.created = new Date();
  workbook.subject = 'Texnik xizmat bo‘yicha hisobot';
  const sheet = workbook.addWorksheet('Texnik xizmat', {
    properties: { defaultRowHeight: 20 },
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 9 }],
  });
  sheet.columns = [
    { key: 'index', width: 7 }, { key: 'image', width: 11 }, { key: 'asset', width: 21 },
    { key: 'model', width: 20 }, { key: 'inventory', width: 21 }, { key: 'department', width: 20 },
    { key: 'user', width: 25 }, { key: 'issue', width: 30 }, { key: 'status', width: 19 },
    { key: 'date', width: 20 },
  ];
  sheet.mergeCells('A1:J2');
  Object.assign(sheet.getCell('A1'), {
    value: 'TEXNIK XIZMAT BO‘YICHA HISOBOT',
    font: { name: 'Arial', size: 20, bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B57' } },
    alignment: { vertical: 'middle', horizontal: 'left', indent: 1 },
  });
  sheet.mergeCells('A3:J3');
  sheet.getCell('A3').value = `Yaratilgan vaqt: ${generatedAt()}`;
  sheet.getCell('A3').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  sheet.mergeCells('A4:J4');
  sheet.getCell('A4').value = `Qo‘llangan filtrlar: ${filters}`;
  sheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  sheet.getCell('A4').alignment = { vertical: 'middle', wrapText: true, indent: 1 };
  [
    ['A6:B7', 'JAMI', summary.total, '1677FF'],
    ['C6:D7', 'OCHIQ', summary.open, 'D99100'],
    ['E6:G7', 'TUZATILDI', summary.repaired, '2E7D32'],
    ['H6:J7', 'ALMASHTIRILDI / OMBORDA', summary.replaced, '7E22CE'],
  ].forEach(([range, label, value, color]) => {
    sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(':')[0]);
    cell.value = `${value}\n${label}`;
    cell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  const header = sheet.getRow(9);
  header.values = ['№', 'Rasm', 'Qurilma', 'Model', 'Inventar raqami', 'Bo‘lim', 'Foydalanuvchi', 'Muammo', 'Jarayon holati', 'Sana'];
  header.height = 30;
  header.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245B78' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  logs.forEach((log, index) => {
    const row = sheet.addRow({
      index: index + 1, image: '', asset: log.asset?.name || '—', model: log.asset?.model || '—',
      inventory: log.asset?.inventoryNumber || '—', department: log.asset?.department?.name || 'Biriktirilmagan',
      user: log.asset?.assignedUser?.fullName || 'Biriktirilmagan', issue: log.title,
      status: maintenanceLabels[log.status] || log.status,
      date: new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tashkent' }).format(log.createdAt),
    });
    row.height = 48;
    row.eachCell((cell, column) => {
      cell.font = { name: 'Arial', size: 9, color: { argb: 'FF1F2937' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? 'FFF7FAFC' : 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: column === 1 ? 'center' : 'left', wrapText: true };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD7E0E7' } } };
    });
    const reportImage = images.get(log.asset?.id);
    if (reportImage) {
      const imageId = workbook.addImage({ buffer: reportImage.buffer, extension: reportImage.extension });
      sheet.addImage(imageId, { tl: { col: 1.15, row: row.number - 0.88 }, ext: { width: 42, height: 42 }, editAs: 'oneCell' });
    } else {
      row.getCell(2).value = 'Rasm yo‘q';
      row.getCell(2).font = { name: 'Arial', size: 8, italic: true, color: { argb: 'FF94A3B8' } };
    }
    const color = maintenanceColors[log.status] || { background: 'F1F5F9', text: '334155' };
    row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color.background}` } };
    row.getCell(9).font = { name: 'Arial', size: 9, bold: true, color: { argb: `FF${color.text}` } };
  });
  sheet.autoFilter = { from: 'A9', to: `J${Math.max(9, sheet.lastRow.number)}` };
  sheet.pageSetup.printArea = `A1:J${Math.max(9, sheet.lastRow.number)}`;
  sheet.headerFooter.oddFooter = '&L Aktivlarni boshqarish tizimi&C Texnik xizmat&R Sahifa &P / &N';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${maintenanceFilename('xlsx')}"`);
  await workbook.xlsx.write(res);
  res.end();
}));

router.get('/maintenance.pdf', asyncHandler(async (req, res) => {
  const { logs, summary, filters } = await maintenanceReport(req.query, req.user);
  const images = await loadReportImages(logs.map((log) => log.asset));
  const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${maintenanceFilename('pdf')}"`);
  document.pipe(res);
  const width = document.page.width - 60;
  const columns = [
    ['#', 25], ['RASM', 45], ['QURILMA', 75], ['INVENTAR', 85], ["BO'LIM", 75],
    ['FOYDALANUVCHI', 95], ['MUAMMO', 120], ['HOLAT', 80], ['SANA', width - 600],
  ];
  const drawBrand = (continuation = false) => {
    document.rect(0, 0, document.page.width, continuation ? 48 : 78).fill('#173B57');
    document.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(continuation ? 14 : 20)
      .text(continuation ? 'TEXNIK XIZMAT HISOBOTI - DAVOMI' : 'TEXNIK XIZMAT BO‘YICHA HISOBOT', 30, continuation ? 16 : 22);
    if (!continuation) document.fillColor('#DCEAF3').font('Helvetica').fontSize(9).text(`Yaratilgan vaqt: ${pdfSafe(generatedAt())}`, 30, 51);
  };
  const drawHeader = (y) => {
    document.rect(30, y, width, 27).fill('#245B78');
    let x = 30;
    columns.forEach(([label, columnWidth]) => {
      document.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7).text(label, x + 4, y + 9, { width: columnWidth - 8, lineBreak: false });
      x += columnWidth;
    });
    return y + 27;
  };
  drawBrand();
  document.fillColor('#64748B').font('Helvetica').fontSize(8).text(pdfSafe(filters), 30, 88, { width });
  const cards = [
    ['JAMI', summary.total, '#1677FF'], ['OCHIQ', summary.open, '#D99100'],
    ['TUZATILDI', summary.repaired, '#2E7D32'], ['ALMASHTIRILDI / OMBORDA', summary.replaced, '#7E22CE'],
  ];
  cards.forEach(([label, value, color], index) => {
    const cardWidth = (width - 24) / 4;
    const x = 30 + index * (cardWidth + 8);
    document.roundedRect(x, 110, cardWidth, 43, 5).fill(color);
    document.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(15).text(String(value), x + 10, 118);
    document.fontSize(7).text(label, x + 10, 137, { width: cardWidth - 20 });
  });
  let y = drawHeader(170);
  logs.forEach((log, index) => {
    if (y + 38 > document.page.height - 45) {
      document.addPage(); drawBrand(true); y = drawHeader(58);
    }
    document.rect(30, y, width, 38).fill(index % 2 ? '#F7FAFC' : '#FFFFFF');
    const values = [
      String(index + 1), '', truncate(log.asset?.name, 18), truncate(log.asset?.inventoryNumber, 19),
      truncate(log.asset?.department?.name || 'Biriktirilmagan', 18),
      truncate(log.asset?.assignedUser?.fullName || 'Biriktirilmagan', 23),
      truncate(log.title, 32), maintenanceLabels[log.status] || log.status,
      new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Tashkent' }).format(log.createdAt),
    ];
    let x = 30;
    values.forEach((value, columnIndex) => {
      const columnWidth = columns[columnIndex][1];
      if (columnIndex === 1) {
        const reportImage = images.get(log.asset?.id);
        if (reportImage && ['jpeg', 'png'].includes(reportImage.extension)) {
          try {
            document.image(reportImage.buffer, x + 8, y + 4, { fit: [29, 29], align: 'center', valign: 'center' });
          } catch {
            document.fillColor('#94A3B8').font('Helvetica').fontSize(6).text('Rasm yoq', x + 3, y + 16, { width: columnWidth - 6, align: 'center' });
          }
        } else {
          document.fillColor('#94A3B8').font('Helvetica').fontSize(6).text('Rasm yoq', x + 3, y + 16, { width: columnWidth - 6, align: 'center' });
        }
        x += columnWidth;
        return;
      }
      document.fillColor('#1F2937').font(columnIndex === 2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
        .text(pdfSafe(value), x + 4, y + 14, { width: columnWidth - 8, lineBreak: false });
      x += columnWidth;
    });
    document.moveTo(30, y + 38).lineTo(30 + width, y + 38).strokeColor('#D7E0E7').lineWidth(.4).stroke();
    y += 38;
  });
  if (!logs.length) document.fillColor('#64748B').font('Helvetica-Oblique').fontSize(11).text('Filtrlarga mos yozuv topilmadi', 30, y + 18, { width, align: 'center' });
  const range = document.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page += 1) {
    document.switchToPage(page);
    document.fillColor('#64748B').font('Helvetica').fontSize(8).text('Aktivlarni boshqarish tizimi', 30, document.page.height - 32);
    document.text(`Sahifa ${page + 1} / ${range.count}`, document.page.width - 130, document.page.height - 32, { width: 100, align: 'right' });
  }
  document.end();
}));

export default router;
