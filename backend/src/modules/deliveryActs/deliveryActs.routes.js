import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { PDFDocument as EditablePDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '../../config/db.js';
import { env } from '../../config/env.js';
import { authenticate, authorize } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { auditService } from '../audit/audit.service.js';
import { buildDeliveryActText, createDeliveryAct, deliveryActInclude } from './deliveryActs.service.js';
import {
  createDocumentAccessToken,
  createDeliveryActVerificationToken,
  deliveryActFilePath,
  ensureDeliveryActDocx,
  saveDeliveryActDocx,
  verifyDeliveryActVerificationToken,
  verifyDocumentAccessToken,
} from './deliveryActs.document.js';

const router = Router();

const withOnlyOfficeToken = (payload) => env.onlyOfficeJwtSecret
  ? { ...payload, token: jwt.sign(payload, env.onlyOfficeJwtSecret) }
  : payload;

const sanitizeDocumentHtml = (input) => {
  const allowed = new Set(['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'center', 'font']);
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (source, rawTag, attributes) => {
      const tag = rawTag.toLowerCase();
      if (!allowed.has(tag)) return '';
      if (source.startsWith('</')) return tag === 'br' ? '' : `</${tag}>`;
      if (tag === 'br') return '<br>';
      if ((tag === 'p' || tag === 'div') && /text-align\s*:\s*(left|center|right|justify)/i.test(attributes)) {
        const alignment = attributes.match(/text-align\s*:\s*(left|center|right|justify)/i)[1].toLowerCase();
        return `<${tag} style="text-align:${alignment}">`;
      }
      if (tag === 'font') {
        const face = attributes.match(/face=["']?([A-Za-z ,'-]+)["']?/i)?.[1];
        const size = attributes.match(/size=["']?([1-7])["']?/i)?.[1];
        return `<font${face ? ` face="${face}"` : ''}${size ? ` size="${size}"` : ''}>`;
      }
      return `<${tag}>`;
    });
};

const withDocumentText = (act) => act.documentText
  ? act
  : {
    ...act,
    documentText: buildDeliveryActText({
      number: act.number,
      snapshot: act.snapshot,
      createdAt: act.createdAt,
    }),
  };

const waitForDocumentVersion = async (id, previousVersion, timeoutMs = 12000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = await prisma.deliveryAct.findUnique({
      where: { id },
      select: { documentVersion: true },
    });
    if (current?.documentVersion > previousVersion) return current.documentVersion;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new ApiError(503, 'Hujjatdagi oxirgi o‘zgarishlarni saqlash yakunlanmadi. Qayta urinib ko‘ring.');
};

const forceSaveDocument = async (act, documentKey) => {
  if (!documentKey) return;
  const keyPattern = new RegExp(`^delivery-act-${act.id}-v\\d+$`);
  if (!keyPattern.test(documentKey)) throw new ApiError(400, 'Hujjat versiyasi kaliti noto‘g‘ri');

  const command = withOnlyOfficeToken({ c: 'forcesave', key: documentKey });
  const response = await fetch(`${env.onlyOfficePublicUrl.replace(/\/$/, '')}/coauthoring/CommandService.ashx`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new ApiError(503, 'ONLYOFFICE hujjatini saqlash xizmatiga ulanib bo‘lmadi');
  const result = await response.json();
  if (result.error === 4) return;
  if (result.error !== 0) {
    throw new ApiError(503, `ONLYOFFICE hujjatini saqlab bo‘lmadi (kod: ${result.error})`);
  }
  await waitForDocumentVersion(act.id, act.documentVersion);
};

const verificationUrlFor = (act) => {
  const token = createDeliveryActVerificationToken(act);
  return `${env.clientUrl.replace(/\/$/, '')}/verify-delivery-act/${act.id}?token=${encodeURIComponent(token)}`;
};

const signedStampText = (act) => {
  const date = new Date(act.signedAt);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
  return `ELEKTRON IMZOLANGAN: ${day}/${month}/${year}, ${time}`;
};

const addVerificationFooter = async (pdfBuffer, act) => {
  const document = await EditablePDFDocument.load(pdfBuffer);
  const pages = document.getPages();
  const page = pages[pages.length - 1];
  const { width, height } = page.getSize();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const qrBuffer = await QRCode.toBuffer(verificationUrlFor(act), { width: 360, margin: 1 });
  const qrImage = await document.embedPng(qrBuffer);
  const snapshot = act.snapshot || {};
  const text = (value) => safe(value).replace(/[^\x20-\x7E]/g, '?');
  const margin = 52;
  const footerBottom = 24;
  const footerHeight = 92;
  const columnWidth = (width - (margin * 2)) / 3;
  const qrSize = 70;
  const qrX = margin + columnWidth + ((columnWidth - qrSize) / 2);
  const qrY = footerBottom + 15;
  const recipient = text(snapshot.recipient?.fullName);

  page.drawText(signedStampText(act), {
    x: 6,
    y: height - 10,
    size: 6,
    font: bold,
    color: rgb(0.13, 0.48, 0.23),
  });

  // The white footer area intentionally has no visible table borders in the generated PDF.
  page.drawRectangle({
    x: margin,
    y: footerBottom,
    width: width - (margin * 2),
    height: footerHeight,
    color: rgb(1, 1, 1),
  });
  page.drawText('Qabul qiluvchi', {
    x: margin + 14,
    y: footerBottom + 48,
    size: 10,
    font: bold,
  });
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  page.drawText(recipient, {
    x: margin + (columnWidth * 2) + 10,
    y: footerBottom + 48,
    size: Math.max(8, Math.min(10, 150 / Math.max(recipient.length, 1))),
    font: bold,
    maxWidth: columnWidth - 20,
  });
  page.drawText(`${text(act.number)} | ${text(new Date(act.signedAt).toLocaleString('uz-UZ'))}`, {
    x: margin + columnWidth,
    y: footerBottom + 5,
    size: 6.5,
    font: regular,
    maxWidth: columnWidth,
  });
  return Buffer.from(await document.save());
};

router.get('/verify/:id', asyncHandler(async (req, res) => {
  const act = await prisma.deliveryAct.findUnique({
    where: { id: Number(req.params.id) },
    include: deliveryActInclude,
  });
  const valid = Boolean(
    act
    && act.status === 'SIGNED'
    && verifyDeliveryActVerificationToken(act, req.query.token),
  );
  if (!valid) return res.json({ valid: false });
  res.json({
    valid: true,
    number: act.number,
    status: act.status,
    signedAt: act.signedAt,
    recipient: act.snapshot?.recipient?.fullName || act.recipient?.fullName,
    assets: (act.snapshot?.assets?.length ? act.snapshot.assets : [act.snapshot?.asset]).filter(Boolean),
  });
}));

router.get('/:id/office-file', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!verifyDocumentAccessToken(id, req.query.token)) throw new ApiError(403, 'Hujjat havolasi yaroqsiz');
  const act = await prisma.deliveryAct.findUnique({ where: { id } });
  if (!act) throw new ApiError(404, 'Dalolatnoma topilmadi');
  await ensureDeliveryActDocx(withDocumentText(act));
  res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.sendFile(deliveryActFilePath(id));
}));

router.post('/:id/office-callback', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!verifyDocumentAccessToken(id, req.query.token)) return res.json({ error: 1 });
  const status = Number(req.body.status);
  if ([2, 6].includes(status) && req.body.url) {
    const response = await fetch(req.body.url);
    if (!response.ok) return res.json({ error: 1 });
    await saveDeliveryActDocx(id, Buffer.from(await response.arrayBuffer()));
    await prisma.deliveryAct.update({
      where: { id },
      data: { documentVersion: { increment: 1 } },
    });
  }
  res.json({ error: 0 });
}));

router.use(authenticate);

const getAllowedAct = async (id, user) => {
  const act = await prisma.deliveryAct.findUnique({
    where: { id: Number(id) },
    include: deliveryActInclude,
  });
  if (!act) throw new ApiError(404, 'Dalolatnoma topilmadi');
  if (user.role !== 'ADMIN' && act.recipientId !== user.id) {
    throw new ApiError(403, 'Bu dalolatnomani ko‘rish uchun ruxsat yo‘q');
  }
  return withDocumentText(act);
};

router.get('/:id/editor-config', asyncHandler(async (req, res) => {
  const act = await getAllowedAct(req.params.id, req.user);
  if (act.status === 'SIGNED') {
    throw new ApiError(400, 'Imzolangan dalolatnoma faqat yakuniy PDF shaklida ko‘rsatiladi');
  }
  await ensureDeliveryActDocx(act);
  const token = createDocumentAccessToken(act.id);
  const backendUrl = env.onlyOfficeBackendUrl.replace(/\/$/, '');
  const canEdit = req.user.role === 'ADMIN' && act.status === 'DRAFT';
  const config = {
    documentServerUrl: env.onlyOfficePublicUrl.replace(/\/$/, ''),
    config: {
      document: {
        fileType: 'docx',
        key: `delivery-act-${act.id}-v${act.documentVersion}`,
        title: `${act.number}.docx`,
        url: `${backendUrl}/api/delivery-acts/${act.id}/office-file?token=${encodeURIComponent(token)}`,
        permissions: {
          edit: canEdit,
          download: true,
          print: true,
          review: false,
          comment: false,
        },
      },
      documentType: 'word',
      editorConfig: {
        mode: canEdit ? 'edit' : 'view',
        lang: 'en',
        callbackUrl: `${backendUrl}/api/delivery-acts/${act.id}/office-callback?token=${encodeURIComponent(token)}`,
        user: {
          id: String(req.user.id),
          name: req.user.fullName,
        },
        customization: {
          autosave: true,
          forcesave: true,
          compactHeader: false,
          toolbarNoTabs: false,
        },
      },
      height: '100%',
      width: '100%',
    },
  };
  if (env.onlyOfficeJwtSecret) {
    config.config.token = jwt.sign(config.config, env.onlyOfficeJwtSecret);
  }
  res.json(config);
}));

router.get('/user/:userId', asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  if (req.user.role !== 'ADMIN' && req.user.id !== userId) {
    throw new ApiError(403, 'Faqat o‘z dalolatnomalaringizni ko‘rishingiz mumkin');
  }
  const acts = await prisma.deliveryAct.findMany({
    where: { recipientId: userId },
    include: deliveryActInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(acts.map(withDocumentText));
}));

router.get('/', asyncHandler(async (req, res) => {
  const acts = await prisma.deliveryAct.findMany({
    where: req.user.role === 'ADMIN' ? {} : { recipientId: req.user.id },
    include: deliveryActInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(acts.map(withDocumentText));
}));

router.post('/', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const assetId = Number(req.body.assetId);
  const recipientId = Number(req.body.recipientId);
  const act = await prisma.$transaction(async (tx) => {
    const [asset, recipient, creator, existing, assignedAssets] = await Promise.all([
      tx.asset.findUnique({ where: { id: assetId }, include: { department: true } }),
      tx.user.findUnique({ where: { id: recipientId }, include: { department: true } }),
      tx.user.findUnique({ where: { id: req.user.id } }),
      tx.deliveryAct.findFirst({
        where: { assetId, recipientId, status: { in: ['DRAFT', 'PENDING'] } },
        orderBy: { createdAt: 'desc' },
      }),
      tx.asset.findMany({
        where: { assignedUserId: recipientId },
        orderBy: { id: 'asc' },
      }),
    ]);
    if (!asset || !recipient || !creator) throw new ApiError(404, 'Qurilma yoki xodim topilmadi');
    if (asset.assignedUserId !== recipient.id) throw new ApiError(400, 'Qurilma bu xodimga biriktirilmagan');
    if (existing) return existing;
    return createDeliveryAct(tx, {
      asset,
      assets: assignedAssets,
      recipient,
      creator,
      department: recipient.department || asset.department,
    });
  });
  res.status(201).json(act);
}));

router.put('/:id', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const current = await getAllowedAct(req.params.id, req.user);
  if (current.status !== 'DRAFT') throw new ApiError(400, 'Faqat qoralama dalolatnomani tahrirlash mumkin');
  const { condition, equipment, note, documentText } = req.body;
  if (!documentText?.trim()) throw new ApiError(400, 'Dalolatnoma matni bo‘sh bo‘lishi mumkin emas');
  if (documentText.length > 30000) throw new ApiError(400, 'Dalolatnoma matni juda uzun');
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.deliveryAct.update({
      where: { id: current.id },
      data: {
        condition: (condition || current.condition).trim(),
        equipment: equipment === undefined ? current.equipment : (equipment?.trim() || null),
        note: note === undefined ? current.note : (note?.trim() || null),
        documentText: sanitizeDocumentHtml(documentText.trim()),
      },
      include: deliveryActInclude,
    });
    await auditService.log(req.user.id, 'DELIVERY_ACT_UPDATE', 'DeliveryAct', item.id, { objectName: item.number }, req.ip, tx);
    return item;
  });
  res.json(updated);
}));

router.post('/:id/send', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const current = await getAllowedAct(req.params.id, req.user);
  if (current.status !== 'DRAFT') throw new ApiError(400, 'Faqat qoralama dalolatnomani yuborish mumkin');
  await forceSaveDocument(current, req.body.documentKey);
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.deliveryAct.update({
      where: { id: current.id },
      data: { status: 'PENDING', sentAt: new Date() },
      include: deliveryActInclude,
    });
    await auditService.log(req.user.id, 'DELIVERY_ACT_SEND', 'DeliveryAct', item.id, { objectName: item.number }, req.ip, tx);
    return item;
  });
  res.json(updated);
}));

router.post('/:id/sign', asyncHandler(async (req, res) => {
  const current = await getAllowedAct(req.params.id, req.user);
  if (current.recipientId !== req.user.id) throw new ApiError(403, 'Dalolatnomani faqat qabul qiluvchi xodim imzolashi mumkin');
  if (current.status !== 'PENDING') throw new ApiError(400, 'Dalolatnoma imzolash uchun yuborilmagan');
  if (!req.body.accepted) throw new ApiError(400, 'Dalolatnoma shartlarini qabul qilishingiz kerak');
  const signer = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!req.body.password || !(await bcrypt.compare(req.body.password, signer.password))) {
    throw new ApiError(401, 'Parol noto‘g‘ri');
  }
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.deliveryAct.update({
      where: { id: current.id },
      data: { status: 'SIGNED', signedAt: new Date() },
      include: deliveryActInclude,
    });
    await auditService.log(req.user.id, 'DELIVERY_ACT_SIGN', 'DeliveryAct', item.id, { objectName: item.number }, req.ip, tx);
    return item;
  });
  res.json(updated);
}));

const safe = (value) => String(value ?? '—')
  .replace(/[‘’]/g, "'")
  .replace(/–|—/g, '-');

router.get('/:id/doc', asyncHandler(async (req, res) => {
  const act = await getAllowedAct(req.params.id, req.user);
  if (act.status === 'SIGNED') {
    throw new ApiError(400, 'Imzolangan dalolatnomaning Word shaklini yuklab olish mumkin emas');
  }
  await ensureDeliveryActDocx(act);
  res.download(deliveryActFilePath(act.id), `${act.number}.docx`);
}));

router.get('/:id/pdf', asyncHandler(async (req, res) => {
  const act = await getAllowedAct(req.params.id, req.user);
  await ensureDeliveryActDocx(act);
  const accessToken = createDocumentAccessToken(act.id);
  const backendUrl = env.onlyOfficeBackendUrl.replace(/\/$/, '');
  try {
    const conversionRequest = withOnlyOfficeToken({
      async: false,
      filetype: 'docx',
      key: `delivery-act-${act.id}-pdf-v${act.documentVersion}-${act.signedAt ? new Date(act.signedAt).getTime() : 'draft'}`,
      outputtype: 'pdf',
      title: `${act.number}.docx`,
      url: `${backendUrl}/api/delivery-acts/${act.id}/office-file?token=${encodeURIComponent(accessToken)}`,
    });
    const conversionResponse = await fetch(`${env.onlyOfficePublicUrl.replace(/\/$/, '')}/ConvertService.ashx`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(conversionRequest),
    });
    const conversion = await conversionResponse.json();
    if (conversion.endConvert && conversion.fileUrl) {
      const pdfResponse = await fetch(conversion.fileUrl);
      if (pdfResponse.ok) {
        const convertedPdf = Buffer.from(await pdfResponse.arrayBuffer());
        const outputPdf = act.status === 'SIGNED'
          ? await addVerificationFooter(convertedPdf, act)
          : convertedPdf;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${act.number}.pdf"`);
        return res.send(outputPdf);
      }
    }
    throw new Error(conversion.error ? `ONLYOFFICE conversion error: ${conversion.error}` : 'ONLYOFFICE PDF faylini qaytarmadi');
  } catch (error) {
    console.error('Delivery act PDF conversion failed:', error);
    throw new ApiError(
      503,
      'PDF yaratib bo‘lmadi. ONLYOFFICE konvertatsiya xizmati bilan bog‘lanishni tekshiring.',
    );
  }
}));

export default router;
