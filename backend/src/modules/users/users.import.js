import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { prisma } from '../../config/db.js';
import { isSuperAdmin } from '../../middlewares/auth.js';
import { ApiError } from '../../utils/apiError.js';
import { archiveFileName, optimizeArchiveImage, readImageArchive } from '../../utils/importImages.js';
import { auditService } from '../audit/audit.service.js';

const headers = ['Ism-familiya', 'Login', 'Vaqtinchalik parol', 'Shaxsiy telefon', 'Xizmat telefoni', 'Ichki raqam', 'Pasport', 'JShShIR', 'Rol', 'Tashkilot', 'Bo‘lim', 'Lavozim', 'Rasm fayli'];
const requiredHeaders = ['Ism-familiya', 'Login', 'Vaqtinchalik parol', 'Pasport', 'JShShIR', 'Rol', 'Tashkilot', 'Bo‘lim'];
const roleMap = new Map([
  ['kuzatuvchi', 'VIEWER'], ['viewer', 'VIEWER'],
  ['menejer', 'MANAGER'], ['manager', 'MANAGER'],
  ['texnik', 'TECHNICIAN'], ['technician', 'TECHNICIAN'],
  ['tashkilot administratori', 'ORGANIZATION_ADMIN'], ['organization_admin', 'ORGANIZATION_ADMIN'],
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
const countValues = (rows, field, normalize = key) => {
  const counts = new Map();
  rows.forEach(({ values }) => {
    const value = normalize(values[field]);
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
};

const referenceData = async (actor) => {
  const organizationId = isSuperAdmin(actor) ? null : Number(actor.managedOrganizationId);
  const where = organizationId ? { id: organizationId } : {};
  const [organizations, departments, assignments] = await Promise.all([
    prisma.organization.findMany({ where, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.department.findMany({
      where: organizationId ? { organizationId } : {},
      select: { id: true, name: true, organizationId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.departmentPosition.findMany({
      where: organizationId ? { department: { organizationId } } : {},
      select: { id: true, departmentId: true, position: { select: { name: true } } },
    }),
  ]);
  return { organizations, departments, assignments };
};

export const buildUserImportTemplate = async (actor) => {
  const { organizations, departments, assignments } = await referenceData(actor);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aktivlar tizimi';
  const sheet = workbook.addWorksheet('Xodimlar', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: headers[0], key: 'fullName', width: 34 },
    { header: headers[1], key: 'login', width: 22 },
    { header: headers[2], key: 'password', width: 24 },
    { header: headers[3], key: 'phone', width: 22 },
    { header: headers[4], key: 'servicePhone', width: 22 },
    { header: headers[5], key: 'extensionNumber', width: 16 },
    { header: headers[6], key: 'passport', width: 18 },
    { header: headers[7], key: 'pinfl', width: 22 },
    { header: headers[8], key: 'role', width: 26 },
    { header: headers[9], key: 'organization', width: 32 },
    { header: headers[10], key: 'department', width: 36 },
    { header: headers[11], key: 'position', width: 28 },
    { header: headers[12], key: 'imageFile', width: 28 },
  ];
  sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1677FF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  const department = departments[0];
  sheet.addRow({
    fullName: 'Aliyev Ali Valiyevich',
    login: 'aliyev.ali',
    password: 'Vaqtincha#2026',
    phone: '+998 90 123 45 67',
    servicePhone: '+998 71 123 45 67',
    extensionNumber: '01401',
    passport: 'AA1234567',
    pinfl: '12345678901234',
    role: 'Kuzatuvchi',
    organization: organizations.find((item) => item.id === department?.organizationId)?.name || organizations[0]?.name || '',
    department: department?.name || '',
    position: assignments.find((item) => item.departmentId === department?.id)?.position.name || '',
    imageFile: 'aliyev.ali.jpg',
  });
  for (let row = 2; row <= 10001; row += 1) {
    sheet.getCell(`I${row}`).dataValidation = {
      type: 'list', allowBlank: false,
      formulae: ['"Kuzatuvchi,Menejer,Texnik,Tashkilot administratori"'],
    };
  }
  sheet.autoFilter = { from: 'A1', to: 'M1' };

  const guide = workbook.addWorksheet('Yo‘riqnoma');
  guide.columns = [{ width: 30 }, { width: 95 }];
  [
    ['Qoida', 'Izoh'],
    ['Majburiy', 'Ism-familiya, Login, Vaqtinchalik parol, Pasport, JShShIR, Rol, Tashkilot va Bo‘lim.'],
    ['Vaqtinchalik parol', 'Kamida 8 ta belgi. Xodim tizimga kirgach parolini almashtirishi tavsiya etiladi.'],
    ['Telefonlar', 'Shaxsiy telefon, xizmat telefoni va faqat raqamlardan iborat ichki raqam alohida ustunlarda kiritiladi.'],
    ['Pasport', 'AA1234567 formatida va takrorlanmas bo‘lishi kerak.'],
    ['JShShIR', '14 ta raqam va takrorlanmas bo‘lishi kerak.'],
    ['Lavozim', 'Ixtiyoriy, ammo tanlansa aynan ko‘rsatilgan bo‘limga biriktirilgan bo‘lishi kerak.'],
    ['Rasm fayli', 'Ixtiyoriy. ZIP ichidagi JPG, PNG yoki WEBP fayl nomi.'],
    ['Maksimal hajm', 'Bitta faylda 10 000 tagacha xodim.'],
  ].forEach((row) => guide.addRow(row));
  guide.getRow(1).font = { bold: true };

  const refs = workbook.addWorksheet('Ma’lumotnomalar');
  refs.columns = [{ header: 'Tashkilot', width: 34 }, { header: 'Bo‘lim', width: 40 }, { header: 'Lavozim', width: 32 }];
  assignments.forEach((assignment) => {
    const dep = departments.find((item) => item.id === assignment.departmentId);
    refs.addRow([
      organizations.find((item) => item.id === dep?.organizationId)?.name || '',
      dep?.name || '',
      assignment.position.name,
    ]);
  });
  refs.getRow(1).font = { bold: true };
  return workbook.xlsx.writeBuffer();
};

const existingValues = async (field, values) => {
  const found = new Set();
  for (let index = 0; index < values.length; index += 1000) {
    const rows = await prisma.user.findMany({
      where: { [field]: { in: values.slice(index, index + 1000), ...(field === 'login' ? { mode: 'insensitive' } : {}) } },
      select: { [field]: true },
    });
    rows.forEach((row) => found.add(key(row[field])));
  }
  return found;
};

export const validateUserImport = async (buffer, actor, imageArchiveBuffer) => {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { throw new ApiError(400, 'Excel faylini o‘qib bo‘lmadi yoki fayl buzilgan'); }
  const sheet = workbook.getWorksheet('Xodimlar') || workbook.worksheets[0];
  if (!sheet) throw new ApiError(400, 'Excel faylida Xodimlar jadvali topilmadi');
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
  if (!dataRows.length) throw new ApiError(400, 'Import qilinadigan xodimlar mavjud emas');
  if (dataRows.length > 10000) throw new ApiError(400, 'Bitta faylda 10 000 tadan ortiq xodim bo‘lishi mumkin emas');

  const { organizations, departments, assignments } = await referenceData(actor);
  const organizationByName = new Map(organizations.map((item) => [key(item.name), item]));
  const departmentByKey = new Map(departments.map((item) => [`${item.organizationId}:${key(item.name)}`, item]));
  const assignmentByKey = new Map(assignments.map((item) => [`${item.departmentId}:${key(item.position.name)}`, item]));
  const loginCounts = countValues(dataRows, 'Login');
  const passportCounts = countValues(dataRows, 'Pasport', (value) => String(value || '').replace(/[\s-]/g, '').toUpperCase());
  const pinflCounts = countValues(dataRows, 'JShShIR', (value) => String(value || '').replace(/\s/g, ''));
  const [existingLogins, existingPassports, existingPinfls] = await Promise.all([
    existingValues('login', [...loginCounts.keys()]),
    existingValues('passportSeries', [...passportCounts.keys()]),
    existingValues('pinfl', [...pinflCounts.keys()]),
  ]);
  const archive = readImageArchive(imageArchiveBuffer);
  const optimizedImages = new Map();
  const usedImages = new Set();
  const validRows = [];
  const errors = [];

  for (const { rowNumber, values } of dataRows) {
    const rowErrors = [];
    const fullName = values['Ism-familiya'].trim();
    const login = values.Login.trim();
    const password = values['Vaqtinchalik parol'];
    const phone = values['Shaxsiy telefon'].trim() || null;
    const servicePhone = values['Xizmat telefoni'].trim() || null;
    const extensionNumber = values['Ichki raqam'].trim() || null;
    const passportSeries = values.Pasport.replace(/[\s-]/g, '').toUpperCase();
    const pinfl = values.JShShIR.replace(/\s/g, '');
    const role = roleMap.get(key(values.Rol));
    const organization = organizationByName.get(key(values.Tashkilot));
    const department = organization ? departmentByKey.get(`${organization.id}:${key(values['Bo‘lim'])}`) : null;
    const assignment = department && values.Lavozim ? assignmentByKey.get(`${department.id}:${key(values.Lavozim)}`) : null;
    const requestedImage = archiveFileName(values['Rasm fayli']);
    const requestedImageKey = key(requestedImage);
    let imageUrl = null;

    if (fullName.length < 3 || fullName.length > 120) rowErrors.push('Ism-familiya 3–120 belgidan iborat bo‘lishi kerak');
    if (!login) rowErrors.push('Login kiritilmagan');
    if (loginCounts.get(key(login)) > 1) rowErrors.push('Login faylda takrorlangan');
    if (existingLogins.has(key(login))) rowErrors.push('Login tizimda mavjud');
    if (password.length < 8 || password.length > 128) rowErrors.push('Parol 8–128 belgidan iborat bo‘lishi kerak');
    if (extensionNumber && !/^\d{1,12}$/.test(extensionNumber)) rowErrors.push('Ichki raqam 1–12 ta raqamdan iborat bo‘lishi kerak');
    if (!/^[A-Z]{2}\d{7}$/.test(passportSeries)) rowErrors.push('Pasport AA1234567 formatida emas');
    if (passportCounts.get(passportSeries) > 1) rowErrors.push('Pasport faylda takrorlangan');
    if (existingPassports.has(key(passportSeries))) rowErrors.push('Pasport tizimda mavjud');
    if (!/^\d{14}$/.test(pinfl)) rowErrors.push('JShShIR 14 ta raqamdan iborat emas');
    if (pinflCounts.get(pinfl) > 1) rowErrors.push('JShShIR faylda takrorlangan');
    if (existingPinfls.has(key(pinfl))) rowErrors.push('JShShIR tizimda mavjud');
    if (!role) rowErrors.push('Rol noto‘g‘ri');
    if (role === 'ORGANIZATION_ADMIN' && !isSuperAdmin(actor)) rowErrors.push('Tashkilot administratori bu rolni yarata olmaydi');
    if (!organization) rowErrors.push('Tashkilot topilmadi');
    if (role !== 'ORGANIZATION_ADMIN' && organization && !department) rowErrors.push('Bo‘lim tanlangan tashkilotda topilmadi');
    if (values.Lavozim && !assignment) rowErrors.push('Lavozim tanlangan bo‘limga biriktirilmagan');
    if (requestedImage) {
      if (!imageArchiveBuffer) rowErrors.push('Rasm ko‘rsatilgan, lekin ZIP yuklanmagan');
      else if (archive.duplicateNames.has(requestedImageKey)) rowErrors.push('ZIP ichida shu nomli rasm takrorlangan');
      else if (!archive.entries.has(requestedImageKey)) rowErrors.push(`ZIP ichida "${requestedImage}" topilmadi`);
      else {
        try {
          if (!optimizedImages.has(requestedImageKey)) optimizedImages.set(requestedImageKey, await optimizeArchiveImage(archive.entries.get(requestedImageKey), true));
          imageUrl = optimizedImages.get(requestedImageKey);
          usedImages.add(requestedImageKey);
        } catch (error) { rowErrors.push(`${requestedImage}: ${error.message || 'rasmni qayta ishlab bo‘lmadi'}`); }
      }
    }
    if (rowErrors.length) errors.push({ rowNumber, identifier: login || passportSeries || '—', messages: rowErrors });
    else validRows.push({
      fullName, login, password, phone, servicePhone, extensionNumber, passportSeries, pinfl, role,
      email: `${login}@local.invalid`,
      departmentId: role === 'ORGANIZATION_ADMIN' ? null : department.id,
      departmentPositionId: role === 'ORGANIZATION_ADMIN' ? null : assignment?.id || null,
      managedOrganizationId: role === 'ORGANIZATION_ADMIN' ? organization.id : null,
      imageUrl,
    });
  }
  return {
    summary: { total: dataRows.length, valid: validRows.length, invalid: errors.length },
    errors: errors.slice(0, 500),
    errorsTruncated: errors.length > 500,
    images: { inArchive: archive.total, matched: usedImages.size, unused: Math.max(archive.total - usedImages.size, 0) },
    validRows,
  };
};

export const importUsers = async (buffer, actor, ipAddress, imageArchiveBuffer) => {
  const result = await validateUserImport(buffer, actor, imageArchiveBuffer);
  if (result.summary.invalid) {
    const error = new ApiError(400, 'Excel faylida xatolar mavjud. Avval ularni tuzating');
    error.details = { summary: result.summary, errors: result.errors, errorsTruncated: result.errorsTruncated, images: result.images };
    throw error;
  }
  const rows = [];
  for (let index = 0; index < result.validRows.length; index += 50) {
    const batch = result.validRows.slice(index, index + 50);
    rows.push(...await Promise.all(batch.map(async (row) => ({ ...row, password: await bcrypt.hash(row.password, 10) }))));
  }
  const imported = await prisma.$transaction(async (tx) => {
    let count = 0;
    for (let index = 0; index < rows.length; index += 250) {
      count += (await tx.user.createMany({ data: rows.slice(index, index + 250), skipDuplicates: false })).count;
    }
    await auditService.log(actor.id, 'USER_BULK_IMPORT', 'UserImport', null, {
      objectName: 'Xodimlar Excel importi', imported: count, importedImages: result.images.matched,
    }, ipAddress, tx);
    return count;
  }, { maxWait: 10000, timeout: 120000 });
  return { imported, importedImages: result.images.matched };
};
