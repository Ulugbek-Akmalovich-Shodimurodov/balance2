import ExcelJS from 'exceljs';
import { prisma } from '../../config/db.js';
import { ApiError } from '../../utils/apiError.js';
import { auditService } from '../audit/audit.service.js';
import { isSuperAdmin } from '../../middlewares/auth.js';
import { archiveFileName, optimizeArchiveImage, readImageArchive } from '../../utils/importImages.js';

const headers = ['Nomi', 'Model', 'Inventar raqami', 'Yili', 'Tashkilot', 'Bo‘lim', 'Holat', 'Foydalanuvchi login', 'Rasm fayli'];
const requiredHeaders = headers.slice(0, 7);
const statusMap = new Map([
  ['faol', 'ACTIVE'],
  ['active', 'ACTIVE'],
  ['soz', 'ACTIVE'],
  ['nosoz', 'BROKEN'],
  ['broken', 'BROKEN'],
  ['foydalanishdan chiqarilgan', 'DISPOSED'],
  ['chiqarilgan', 'DISPOSED'],
  ['disposed', 'DISPOSED'],
]);
const text = (cell) => {
  const value = cell?.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text).trim();
    if ('result' in value) return String(value.result ?? '').trim();
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text).join('').trim();
  }
  return String(value).trim();
};
const key = (value) => String(value || '').trim().toLocaleLowerCase('uz');

const actorOrganizationId = async (actor) => {
  if (isSuperAdmin(actor)) return null;
  if (actor.managedOrganizationId) return Number(actor.managedOrganizationId);
  const row = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { department: { select: { organizationId: true } } },
  });
  return row?.department?.organizationId || null;
};

const referenceData = async (actor) => {
  const scopeOrganizationId = await actorOrganizationId(actor);
  const [organizations, departments, users] = await Promise.all([
    prisma.organization.findMany({
      where: scopeOrganizationId ? { id: scopeOrganizationId } : {},
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.department.findMany({
      where: scopeOrganizationId ? { organizationId: scopeOrganizationId } : {},
      select: { id: true, name: true, organizationId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: scopeOrganizationId ? { department: { organizationId: scopeOrganizationId } } : {},
      select: { id: true, login: true, departmentId: true },
    }),
  ]);
  return { scopeOrganizationId, organizations, departments, users };
};

export const buildAssetImportTemplate = async (actor) => {
  const { organizations, departments } = await referenceData(actor);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aktivlar tizimi';
  const sheet = workbook.addWorksheet('Qurilmalar', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: headers[0], key: 'name', width: 24 },
    { header: headers[1], key: 'model', width: 24 },
    { header: headers[2], key: 'inventoryNumber', width: 24 },
    { header: headers[3], key: 'year', width: 12 },
    { header: headers[4], key: 'organization', width: 30 },
    { header: headers[5], key: 'department', width: 34 },
    { header: headers[6], key: 'status', width: 24 },
    { header: headers[7], key: 'login', width: 24 },
    { header: headers[8], key: 'imageFile', width: 28 },
  ];
  sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1677FF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.addRow({
    name: 'Printer',
    model: 'Canon MF443dw',
    inventoryNumber: '203020334',
    year: new Date().getFullYear(),
    organization: organizations[0]?.name || '',
    department: departments[0]?.name || '',
    status: 'Faol',
    login: '',
    imageFile: '203020334.jpg',
  });
  for (let row = 2; row <= 20001; row += 1) {
    sheet.getCell(`D${row}`).dataValidation = {
      type: 'whole',
      operator: 'between',
      formulae: [1900, 2100],
      showErrorMessage: true,
      errorTitle: 'Yil noto‘g‘ri',
      error: '1900–2100 oralig‘idagi yilni kiriting.',
    };
    sheet.getCell(`G${row}`).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"Faol,Nosoz,Foydalanishdan chiqarilgan"'],
    };
  }
  sheet.autoFilter = { from: 'A1', to: 'I1' };

  const guide = workbook.addWorksheet('Yo‘riqnoma');
  guide.columns = [{ width: 28 }, { width: 90 }];
  [
    ['Qoida', 'Izoh'],
    ['Majburiy ustunlar', 'Nomi, Model, Inventar raqami, Yili, Tashkilot, Bo‘lim va Holat.'],
    ['Inventar raqami', 'Tizimda va fayl ichida takrorlanmasligi kerak.'],
    ['Yili', '1900–2100 oralig‘idagi to‘rt xonali yil.'],
    ['Holat', 'Faol, Nosoz yoki Foydalanishdan chiqarilgan.'],
    ['Foydalanuvchi login', 'Ixtiyoriy. Login ko‘rsatilsa, foydalanuvchi tanlangan bo‘limga tegishli bo‘lishi kerak.'],
    ['Rasm fayli', 'Ixtiyoriy. ZIP ichidagi aniq fayl nomi, masalan: 203020334.jpg. JPG, PNG va WEBP qo‘llanadi.'],
    ['Rasmlar ZIP fayli', 'Rasm fayllarini bitta ZIP arxivga joylang. Har bir rasm 8 MB dan oshmasin.'],
    ['Maksimal hajm', 'Bitta faylda 20 000 tagacha qurilma.'],
  ].forEach((row) => guide.addRow(row));
  guide.getRow(1).font = { bold: true };

  const refs = workbook.addWorksheet('Ma’lumotnomalar');
  refs.columns = [{ header: 'Tashkilot', width: 34 }, { header: 'Bo‘lim', width: 40 }];
  departments.forEach((department) => {
    refs.addRow([
      organizations.find((organization) => organization.id === department.organizationId)?.name || '',
      department.name,
    ]);
  });
  refs.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
};

export const validateAssetImport = async (buffer, actor, imageArchiveBuffer) => {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ApiError(400, 'Excel faylini o‘qib bo‘lmadi yoki fayl buzilgan');
  }
  const sheet = workbook.getWorksheet('Qurilmalar') || workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, 'Excel faylida jadval topilmadi');
  const headerByName = new Map();
  sheet.getRow(1).eachCell((cell, column) => headerByName.set(text(cell), column));
  const missing = requiredHeaders.filter((header) => !headerByName.has(header));
  if (missing.length) throw new ApiError(400, `Majburiy ustunlar topilmadi: ${missing.join(', ')}`);

  const dataRows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = Object.fromEntries(headers.map((header) => {
      const column = headerByName.get(header);
      return [header, column ? text(row.getCell(column)) : ''];
    }));
    if (Object.values(values).some(Boolean)) dataRows.push({ rowNumber, values });
  });
  if (!dataRows.length) throw new ApiError(400, 'Import qilinadigan qatorlar mavjud emas');
  if (dataRows.length > 20000) throw new ApiError(400, 'Bitta faylda 20 000 tadan ortiq qurilma bo‘lishi mumkin emas');

  const { organizations, departments, users } = await referenceData(actor);
  const archive = readImageArchive(imageArchiveBuffer);
  const optimizedImages = new Map();
  const usedImages = new Set();
  const organizationByName = new Map(organizations.map((item) => [key(item.name), item]));
  const departmentByKey = new Map(departments.map((item) => [`${item.organizationId}:${key(item.name)}`, item]));
  const userByLogin = new Map(users.filter((item) => item.login).map((item) => [key(item.login), item]));
  const inventoryCounts = new Map();
  dataRows.forEach(({ values }) => {
    const inventory = values['Inventar raqami'];
    if (inventory) inventoryCounts.set(inventory, (inventoryCounts.get(inventory) || 0) + 1);
  });
  const inventories = [...inventoryCounts.keys()];
  const existing = new Set();
  for (let index = 0; index < inventories.length; index += 1000) {
    const rows = await prisma.asset.findMany({
      where: { inventoryNumber: { in: inventories.slice(index, index + 1000) } },
      select: { inventoryNumber: true },
    });
    rows.forEach((item) => existing.add(item.inventoryNumber));
  }

  const validRows = [];
  const errors = [];
  for (const { rowNumber, values } of dataRows) {
    const rowErrors = [];
    const name = values.Nomi;
    const model = values.Model;
    const inventoryNumber = values['Inventar raqami'];
    const manufactureYear = Number(values.Yili);
    const organization = organizationByName.get(key(values.Tashkilot));
    const department = organization
      ? departmentByKey.get(`${organization.id}:${key(values['Bo‘lim'])}`)
      : null;
    const status = statusMap.get(key(values.Holat));
    const assignedUser = values['Foydalanuvchi login']
      ? userByLogin.get(key(values['Foydalanuvchi login']))
      : null;
    const requestedImage = archiveFileName(values['Rasm fayli']);
    const requestedImageKey = key(requestedImage);
    let imageUrl = null;
    if (!name) rowErrors.push('Nomi kiritilmagan');
    if (!model) rowErrors.push('Model kiritilmagan');
    if (!inventoryNumber) rowErrors.push('Inventar raqami kiritilmagan');
    if (inventoryNumber && inventoryCounts.get(inventoryNumber) > 1) rowErrors.push('Inventar raqami faylda takrorlangan');
    if (existing.has(inventoryNumber)) rowErrors.push('Inventar raqami tizimda mavjud');
    if (!Number.isInteger(manufactureYear) || manufactureYear < 1900 || manufactureYear > 2100) rowErrors.push('Yili 1900–2100 oralig‘ida emas');
    if (!organization) rowErrors.push('Tashkilot topilmadi');
    if (organization && !department) rowErrors.push('Bo‘lim tanlangan tashkilotda topilmadi');
    if (!status) rowErrors.push('Holat noto‘g‘ri');
    if (values['Foydalanuvchi login'] && !assignedUser) rowErrors.push('Foydalanuvchi login topilmadi');
    if (assignedUser && department && assignedUser.departmentId !== department.id) rowErrors.push('Foydalanuvchi tanlangan bo‘limga tegishli emas');
    if (department?.name?.trim().toLocaleLowerCase() === 'omborxona' && assignedUser) rowErrors.push('Omborxonadagi qurilma foydalanuvchiga biriktirilmaydi');
    if (requestedImage) {
      if (!imageArchiveBuffer) rowErrors.push('Rasm fayli ko‘rsatilgan, lekin ZIP yuklanmagan');
      else if (archive.duplicateNames.has(requestedImageKey)) rowErrors.push('ZIP ichida shu nomli rasm takrorlangan');
      else if (!archive.entries.has(requestedImageKey)) rowErrors.push(`ZIP ichida "${requestedImage}" topilmadi`);
      else {
        try {
          if (!optimizedImages.has(requestedImageKey)) {
            optimizedImages.set(requestedImageKey, await optimizeArchiveImage(archive.entries.get(requestedImageKey)));
          }
          imageUrl = optimizedImages.get(requestedImageKey);
          usedImages.add(requestedImageKey);
        } catch (error) {
          rowErrors.push(`${requestedImage}: ${error.message || 'rasmni qayta ishlab bo‘lmadi'}`);
        }
      }
    }
    if (rowErrors.length) {
      errors.push({ rowNumber, inventoryNumber: inventoryNumber || '—', messages: rowErrors });
    } else {
      validRows.push({
        name,
        model,
        inventoryNumber,
        manufactureYear,
        status,
        departmentId: department.id,
        assignedUserId: department.name.trim().toLocaleLowerCase() === 'omborxona' ? null : assignedUser?.id || null,
        imageUrl,
      });
    }
  }
  return {
    summary: { total: dataRows.length, valid: validRows.length, invalid: errors.length },
    errors: errors.slice(0, 500),
    errorsTruncated: errors.length > 500,
    images: { inArchive: archive.total, matched: usedImages.size, unused: Math.max(archive.total - usedImages.size, 0) },
    validRows,
  };
};

export const importAssets = async (buffer, actor, ipAddress, imageArchiveBuffer) => {
  const result = await validateAssetImport(buffer, actor, imageArchiveBuffer);
  if (result.summary.invalid) {
    const error = new ApiError(400, 'Excel faylida xatolar mavjud. Avval ularni tuzating');
    error.details = { summary: result.summary, errors: result.errors, errorsTruncated: result.errorsTruncated, images: result.images };
    throw error;
  }
  const imported = await prisma.$transaction(async (tx) => {
    let imported = 0;
    for (let index = 0; index < result.validRows.length; index += 500) {
      const batch = result.validRows.slice(index, index + 500);
      const created = await tx.asset.createMany({ data: batch, skipDuplicates: false });
      imported += created.count;
    }
    await auditService.log(actor.id, 'ASSET_BULK_IMPORT', 'AssetImport', null, {
      objectName: 'Excel import',
      imported,
      importedImages: result.images.matched,
    }, ipAddress, tx);
    return imported;
  }, { maxWait: 10000, timeout: 120000 });
  return { imported, importedImages: result.images.matched };
};
