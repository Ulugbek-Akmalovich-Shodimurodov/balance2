import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apiUrl = 'http://localhost:5000/api';
const suffix = Date.now();
const adminLogin = `act_admin_${suffix}`;
const employeeLogin = `act_employee_${suffix}`;
const adminPassword = 'TestAdmin123!';
const employeePassword = 'TestEmployee123!';
let admin;
let employee;
let asset;
let secondAsset;
let existingAsset;
let department;
let deliveryActId;
let createdDepartment = false;

const request = async (path, { token, expected = 200, ...options } = {}) => {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (response.status !== expected) {
    throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
  }
  return response;
};

const login = async (loginValue, password) => {
  const captcha = await (await request('/auth/captcha')).json();
  const svg = Buffer.from(captcha.image.split(',')[1], 'base64').toString('utf8');
  const captchaAnswer = [...svg.matchAll(/<text[^>]*>([^<])<\/text>/g)].map((match) => match[1]).join('');
  const response = await request('/auth/login', {
    method: 'POST',
    expected: 200,
    body: JSON.stringify({
      login: loginValue,
      password,
      captchaToken: captcha.captchaToken,
      captchaAnswer,
    }),
  });
  return (await response.json()).token;
};

try {
  department = await prisma.department.findFirst({ where: { name: 'Dalolatnoma test bo‘limi' } });
  if (!department) {
    department = await prisma.department.create({ data: { name: 'Dalolatnoma test bo‘limi' } });
    createdDepartment = true;
  }
  const [adminHash, employeeHash] = await Promise.all([
    bcrypt.hash(adminPassword, 4),
    bcrypt.hash(employeePassword, 4),
  ]);
  admin = await prisma.user.create({
    data: {
      fullName: 'Dalolatnoma Test Administratori',
      login: adminLogin,
      email: `${adminLogin}@local.test`,
      password: adminHash,
      role: 'ADMIN',
    },
  });
  employee = await prisma.user.create({
    data: {
      fullName: 'Dalolatnoma Test Xodimi',
      login: employeeLogin,
      email: `${employeeLogin}@local.test`,
      password: employeeHash,
      role: 'VIEWER',
      passportSeries: `TT${String(suffix).slice(-7)}`,
      pinfl: `9${String(suffix).slice(-13).padStart(13, '0')}`,
      departmentId: department.id,
    },
  });
  asset = await prisma.asset.create({
    data: {
      name: 'Test kompyuter',
      model: 'Dalolatnoma Test Model',
      inventoryNumber: `ACT-TEST-${suffix}`,
      serialNumber: `SER-${suffix}`,
      departmentId: department.id,
      assignedUserId: null,
    },
  });
  secondAsset = await prisma.asset.create({
    data: {
      name: 'Test printer',
      model: 'Dalolatnoma Test Printer',
      inventoryNumber: `ACT-TEST-SECOND-${suffix}`,
      serialNumber: `SER-SECOND-${suffix}`,
      departmentId: department.id,
      assignedUserId: null,
    },
  });
  existingAsset = await prisma.asset.create({
    data: {
      name: 'Avvalgi test monitor',
      model: 'Test Monitor 24',
      inventoryNumber: `ACT-EXISTING-${suffix}`,
      serialNumber: `MON-${suffix}`,
      departmentId: department.id,
      assignedUserId: employee.id,
    },
  });

  const adminToken = await login(adminLogin, adminPassword);
  await request('/transactions/assign-batch', {
    method: 'POST',
    token: adminToken,
    expected: 409,
    body: JSON.stringify({ assetIds: [asset.id, existingAsset.id], userId: employee.id, note: 'Rollback test' }),
  });
  const assetAfterRejectedBatch = await prisma.asset.findUnique({ where: { id: asset.id } });
  const actsAfterRejectedBatch = await prisma.deliveryAct.count({ where: { recipientId: employee.id } });
  if (assetAfterRejectedBatch.assignedUserId || actsAfterRejectedBatch) {
    throw new Error('Band qurilma qatnashgan batch to‘liq bekor qilinmadi');
  }

  await request('/transactions/assign-batch', {
    method: 'POST',
    token: adminToken,
    expected: 201,
    body: JSON.stringify({ assetIds: [asset.id, secondAsset.id], userId: employee.id, note: 'Avtomatik batch test' }),
  });

  const acts = await (await request(`/delivery-acts/user/${employee.id}`, { token: adminToken })).json();
  const act = acts.find((item) => item.assetId === asset.id);
  if (!act || act.status !== 'DRAFT') throw new Error('Avtomatik qoralama dalolatnoma yaratilmadi');
  if (act.snapshot?.assets?.length !== 3) {
    throw new Error('Bitta dalolatnomaga xodimning barcha qurilmalari kiritilmadi');
  }
  const createdActs = acts.filter((item) => [asset.id, secondAsset.id].includes(item.assetId));
  if (createdActs.length !== 1) throw new Error('Batch biriktirish uchun bittadan ortiq dalolatnoma yaratildi');
  deliveryActId = act.id;

  const editorConfig = await (await request(`/delivery-acts/${act.id}/editor-config`, { token: adminToken })).json();
  if (!editorConfig.documentServerUrl || editorConfig.config?.editorConfig?.mode !== 'edit') {
    throw new Error('ONLYOFFICE editor konfiguratsiyasi yaratilmagan');
  }

  const edited = await (await request(`/delivery-acts/${act.id}`, {
    method: 'PUT',
    token: adminToken,
    body: JSON.stringify({
      condition: 'Soz, tashqi nuqsonsiz',
      equipment: 'Klaviatura, sichqoncha va quvvat kabeli',
      note: 'Lokal integratsion test',
      documentText: `<h1>DALOLATNOMA</h1><p>${act.documentText}</p><p><b>Qo‘shimcha test izohi:</b> qurilma to‘liq komplektda topshirildi.</p><script>alert('xss')</script>`,
    }),
  })).json();
  if (!edited.documentText.includes('<b>') || edited.documentText.includes('<script')) {
    throw new Error('Formatlangan hujjatni xavfsiz saqlash tekshiruvidan o‘tmadi');
  }
  await request(`/delivery-acts/${act.id}/send`, {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({}),
  });

  const employeeToken = await login(employeeLogin, employeePassword);
  const employeeActs = await (await request('/delivery-acts', { token: employeeToken })).json();
  if (!employeeActs.length || employeeActs.some((item) => item.recipientId !== employee.id)) {
    throw new Error('Xodimga faqat o‘z dalolatnomalari qaytarilmadi');
  }
  const adminActs = await (await request('/delivery-acts', { token: adminToken })).json();
  if (!adminActs.some((item) => item.id === act.id)) {
    throw new Error('Admin uchun umumiy dalolatnomalar ro‘yxati qaytarilmadi');
  }
  const draftDoc = await request(`/delivery-acts/${act.id}/doc`, { token: employeeToken });
  if (!draftDoc.headers.get('content-type')?.includes('officedocument.wordprocessingml.document')) {
    throw new Error('Imzolashdan oldingi DOCX shakllanmadi');
  }
  if ((await draftDoc.arrayBuffer()).byteLength < 5000) throw new Error('DOCX fayl bo‘sh yoki noto‘g‘ri');
  await request(`/delivery-acts/${act.id}/sign`, {
    method: 'POST',
    token: employeeToken,
    expected: 401,
    body: JSON.stringify({ accepted: true, password: 'noto‘g‘ri-parol' }),
  });
  const signed = await (await request(`/delivery-acts/${act.id}/sign`, {
    method: 'POST',
    token: employeeToken,
    body: JSON.stringify({ accepted: true, password: employeePassword }),
  })).json();
  if (signed.status !== 'SIGNED' || !signed.signedAt) throw new Error('Dalolatnoma imzolanmadi');

  await request(`/delivery-acts/${act.id}/doc`, { token: employeeToken, expected: 400 });
  await request(`/delivery-acts/${act.id}/editor-config`, { token: employeeToken, expected: 400 });

  const pdf = await request(`/delivery-acts/${act.id}/pdf`, { token: employeeToken });
  if (!pdf.headers.get('content-type')?.includes('application/pdf')) throw new Error('PDF shakllanmadi');
  if ((await pdf.arrayBuffer()).byteLength < 1000) throw new Error('PDF fayl bo‘sh yoki noto‘g‘ri');

  console.log(`OK: ${signed.number} avtomatik yaratildi, ONLYOFFICE config olindi, yuborildi, parol bilan imzolandi, DOCX va PDF olindi.`);
} finally {
  if (admin || employee || asset || secondAsset || existingAsset) {
    await prisma.$transaction(async (tx) => {
      if (admin || employee) {
        await tx.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: [admin?.id, employee?.id].filter(Boolean) } },
              ...(deliveryActId ? [{ entity: 'DeliveryAct', entityId: deliveryActId }] : []),
            ],
          },
        });
      }
      if (asset || secondAsset || existingAsset) {
        const assetIds = [asset?.id, secondAsset?.id, existingAsset?.id].filter(Boolean);
        await tx.deliveryAct.deleteMany({ where: { assetId: { in: assetIds } } });
        await tx.transaction.deleteMany({ where: { assetId: { in: assetIds } } });
        await tx.asset.deleteMany({ where: { id: { in: assetIds } } });
      }
      await tx.user.deleteMany({ where: { id: { in: [admin?.id, employee?.id].filter(Boolean) } } });
      if (createdDepartment && department) {
        await tx.department.deleteMany({ where: { id: department.id } });
      }
    });
  }
  await prisma.$disconnect();
}
