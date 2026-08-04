import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PDFDocument as EditablePDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '../../config/db.js';
import { env } from '../../config/env.js';
import { authenticate, authorize, isOrganizationAdmin, isSuperAdmin } from '../../middlewares/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/apiError.js';
import { auditService } from '../audit/audit.service.js';
import {
  buildDeliveryActText,
  buildReturnActText,
  createCurrentInventoryDeliveryAct,
  createDeliveryAct,
  createReturnDeliveryAct,
  deliveryActInclude,
  rebuildDeliveryActSnapshot,
} from './deliveryActs.service.js';
import {
  createDocumentAccessToken,
  deliveryActFilePath,
  ensureDeliveryActDocx,
  invalidateDeliveryActDocx,
  saveDeliveryActDocx,
  verifyDeliveryActVerificationToken,
  verifyDeliveryActStageToken,
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
    documentText: (act.snapshot?.type === 'RETURN' ? buildReturnActText : buildDeliveryActText)({
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

const signedAtFormatter = new Intl.DateTimeFormat('uz-UZ', {
  timeZone: 'Asia/Tashkent',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const signedStampText = (act) => {
  const parts = Object.fromEntries(
    signedAtFormatter.formatToParts(new Date(act.signedAt))
      .map(({ type, value }) => [type, value]),
  );
  return `ELEKTRON IMZOLANGAN: ${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}:${parts.second}`;
};

const addVerificationFooter = async (pdfBuffer, act) => {
  const document = await EditablePDFDocument.load(pdfBuffer);
  const pages = document.getPages();
  const page = pages[pages.length - 1];
  const { height } = page.getSize();
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  page.drawText(signedStampText(act), {
    x: 6,
    y: height - 10,
    size: 6,
    font: bold,
    color: rgb(0.13, 0.48, 0.23),
  });
  return Buffer.from(await document.save());
};

router.get('/verify/:id', asyncHandler(async (req, res) => {
  const act = await prisma.deliveryAct.findUnique({
    where: { id: Number(req.params.id) },
    include: deliveryActInclude,
  });
  const stageVerification = act ? verifyDeliveryActStageToken(act, req.query.token) : null;
  const valid = Boolean(act && (
    stageVerification
    || (act.status === 'SIGNED' && verifyDeliveryActVerificationToken(act, req.query.token))
  ));
  if (!valid) return res.json({ valid: false });
  res.json({
    valid: true,
    number: act.number,
    status: act.status,
    signedAt: act.signedAt,
    signatureStage: stageVerification?.stage || 'final',
    signatureTimestamp: stageVerification?.timestamp || act.signedAt,
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
  if (!isSuperAdmin(user) && act.recipientId !== user.id && act.engineerId !== user.id) {
    throw new ApiError(403, 'Bu dalolatnomani ko‘rish uchun ruxsat yo‘q');
  }
  return withDocumentText(act);
};

router.get('/:id/editor-config', asyncHandler(async (req, res) => {
  let act = await getAllowedAct(req.params.id, req.user);
  if (act.snapshot?.templateVersion !== 19 && act.status !== 'SIGNED') {
    const snapshot = await rebuildDeliveryActSnapshot(prisma, act);
    act = await prisma.deliveryAct.update({
      where: { id: act.id },
      data: {
        snapshot,
        documentText: (snapshot?.type === 'RETURN' ? buildReturnActText : buildDeliveryActText)({
          number: act.number,
          snapshot,
          createdAt: act.createdAt,
        }),
        documentVersion: { increment: 1 },
      },
      include: deliveryActInclude,
    });
    await invalidateDeliveryActDocx(act.id);
  }
  if (act.status === 'SIGNED') {
    throw new ApiError(400, 'Imzolangan dalolatnoma faqat yakuniy PDF shaklida ko‘rsatiladi');
  }
  await ensureDeliveryActDocx(act);
  const token = createDocumentAccessToken(act.id);
  const backendUrl = env.onlyOfficeBackendUrl.replace(/\/$/, '');
  const canEdit = (isSuperAdmin(req.user) && act.status === 'DRAFT')
    || (act.snapshot?.type === 'RETURN'
      && act.status === 'REVISION_REQUESTED'
      && act.recipientId === req.user.id);
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
  if (!isSuperAdmin(req.user) && req.user.id !== userId) {
    throw new ApiError(403, 'Faqat o‘z dalolatnomalaringizni ko‘rishingiz mumkin');
  }
  const acts = await prisma.deliveryAct.findMany({
    where: { recipientId: userId },
    include: deliveryActInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(acts.map(withDocumentText));
}));

router.get('/engineers/available', asyncHandler(async (req, res) => {
  const organizationId = isOrganizationAdmin(req.user)
    ? Number(req.user.managedOrganizationId)
    : Number(req.query.organizationId || req.user.managedOrganizationId);
  const engineers = await prisma.user.findMany({
    where: {
      ...(Number.isInteger(organizationId) && organizationId > 0 ? { department: { organizationId } } : {}),
      departmentPosition: { position: { name: { equals: 'TB va XK muhandisi', mode: 'insensitive' } } },
    },
    select: { id: true, fullName: true, department: { select: { id: true, name: true, organizationId: true } } },
    orderBy: { fullName: 'asc' },
  });
  res.json(engineers);
}));

router.get('/', asyncHandler(async (req, res) => {
  const acts = await prisma.deliveryAct.findMany({
    where: isSuperAdmin(req.user) ? {} : { OR: [{ recipientId: req.user.id }, { engineerId: req.user.id }] },
    include: deliveryActInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(acts.map(withDocumentText));
}));

router.post('/returns', asyncHandler(async (req, res) => {
  const recipientId = Number(req.body.recipientId || req.user.id);
  if (!Number.isInteger(recipientId) || recipientId < 1) {
    throw new ApiError(400, 'Xodim ma’lumoti noto‘g‘ri');
  }
  if (!isSuperAdmin(req.user) && recipientId !== req.user.id) {
    throw new ApiError(403, 'Faqat o‘zingizga biriktirilgan qurilmalarni topshirishingiz mumkin');
  }

  const act = await prisma.$transaction(async (tx) => {
    const [recipient, requester, assets, existing] = await Promise.all([
      tx.user.findUnique({
        where: { id: recipientId },
        include: {
          department: true,
          departmentPosition: { include: { position: true } },
        },
      }),
      tx.user.findUnique({ where: { id: req.user.id }, include: { department: true, departmentPosition: { include: { position: true } } } }),
      tx.asset.findMany({
        where: { assignedUserId: recipientId },
        orderBy: { id: 'asc' },
      }),
      tx.deliveryAct.findFirst({
        where: {
          recipientId,
          status: { in: ['DRAFT', 'PENDING', 'AWAITING_ACCEPTANCE', 'REVISION_REQUESTED'] },
          snapshot: { path: ['type'], equals: 'RETURN' },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (!recipient || !requester) throw new ApiError(404, 'Xodim topilmadi');
    if (isOrganizationAdmin(req.user)
      && recipient.department?.organizationId !== req.user.managedOrganizationId) {
      throw new ApiError(403, 'Xodim boshqa tashkilotga tegishli');
    }
    if (!assets.length) throw new ApiError(400, 'Xodimga biriktirilgan qurilmalar mavjud emas');
    if (existing) return existing;

    const organizationId = recipient.department?.organizationId;
    if (!organizationId) throw new ApiError(400, 'Xodimning tashkiloti aniqlanmadi');
    const destination = await tx.department.findFirst({
      where: {
        organizationId,
        name: { equals: 'Omborxona', mode: 'insensitive' },
      },
    });
    if (!destination) throw new ApiError(400, 'Tashkilotda “Omborxona” bo‘limi topilmadi');

    const creator = recipientId === req.user.id
      ? await tx.user.findFirst({
        where: {
          id: { not: recipientId },
          OR: [
            { role: { in: ['SUPER_ADMIN', 'ADMIN'] } },
            { role: 'ORGANIZATION_ADMIN', managedOrganizationId: organizationId },
          ],
        },
        include: { department: true, departmentPosition: { include: { position: true } } },
        orderBy: [{ role: 'asc' }, { id: 'asc' }],
      })
      : requester;
    if (!creator) throw new ApiError(400, 'Qurilmalarni qabul qiluvchi admin topilmadi');
    const engineer = await tx.user.findFirst({
      where: {
        ...(req.body.engineerId ? { id: Number(req.body.engineerId) } : {}),
        department: { organizationId },
        departmentPosition: { position: { name: { equals: 'TB va XK muhandisi', mode: 'insensitive' } } },
      },
      include: { department: true, departmentPosition: { include: { position: true } } },
      orderBy: { id: 'asc' },
    });
    if (!engineer) throw new ApiError(400, 'Tashkilotda TB va XK muhandisi tayinlanmagan');

    const item = await createReturnDeliveryAct(tx, {
      assets,
      recipient,
      creator,
      engineer,
      department: recipient.department,
      destination,
      pending: recipientId === req.user.id,
    });
    await auditService.log(
      req.user.id,
      'DELIVERY_ACT_RETURN_CREATE',
      'DeliveryAct',
      item.id,
      { objectName: item.number, assetIds: assets.map((asset) => asset.id) },
      req.ip,
      tx,
    );
    return item;
  });
  res.status(201).json(act);
}));

router.post('/', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const assetId = Number(req.body.assetId);
  const recipientId = Number(req.body.recipientId);
  const act = await prisma.$transaction(async (tx) => {
    const [asset, recipient, creator, existing, assignedAssets] = await Promise.all([
      tx.asset.findUnique({ where: { id: assetId }, include: { department: true } }),
      tx.user.findUnique({ where: { id: recipientId }, include: { department: true, departmentPosition: { include: { position: true } } } }),
      tx.user.findUnique({ where: { id: req.user.id }, include: { departmentPosition: { include: { position: true } } } }),
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
    if (isOrganizationAdmin(req.user)
      && recipient.department?.organizationId !== req.user.managedOrganizationId) {
      throw new ApiError(403, 'Xodim boshqa tashkilotga tegishli');
    }
    if (asset.assignedUserId !== recipient.id) throw new ApiError(400, 'Qurilma bu xodimga biriktirilmagan');
    if (existing) return existing;
    const engineer = await tx.user.findFirst({
      where: {
        department: { organizationId: recipient.department?.organizationId },
        departmentPosition: { position: { name: { equals: 'TB va XK muhandisi', mode: 'insensitive' } } },
      },
      include: { department: true, departmentPosition: { include: { position: true } } },
    });
    if (!engineer) throw new ApiError(400, 'Tashkilotda TB va XK muhandisi tayinlanmagan');
    return createDeliveryAct(tx, {
      asset,
      assets: assignedAssets,
      recipient,
      creator,
      engineer,
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
  if (current.createdById !== req.user.id) throw new ApiError(403, 'Dalolatnomani faqat uni yaratgan topshiruvchi imzolashi mumkin');
  const signer = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { department: true, departmentPosition: { include: { position: true } } },
  });
  if (!req.body.password || !(await bcrypt.compare(req.body.password, signer.password))) {
    throw new ApiError(401, 'Parol noto‘g‘ri');
  }
  await forceSaveDocument(current, req.body.documentKey);
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.deliveryAct.update({
      where: { id: current.id },
      data: { status: current.snapshot?.type === 'RETURN' ? 'PENDING' : 'AWAITING_ENGINEER', sentAt: new Date() },
      include: deliveryActInclude,
    });
    await auditService.log(req.user.id, 'DELIVERY_ACT_SEND', 'DeliveryAct', item.id, { objectName: item.number }, req.ip, tx);
    return item;
  });
  await invalidateDeliveryActDocx(current.id);
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
    let transactionId = current.transactionId;
    if (false && current.snapshot?.type === 'RETURN') {
      const assetIds = [...new Set(
        (current.snapshot.assets || [])
          .map((asset) => Number(asset.id))
          .filter(Number.isInteger),
      )];
      const destinationId = Number(current.snapshot.destination?.id);
      if (!assetIds.length || !Number.isInteger(destinationId)) {
        throw new ApiError(400, 'Qaytarish dalolatnomasi ma’lumotlari to‘liq emas');
      }
      const assets = await tx.asset.findMany({ where: { id: { in: assetIds } } });
      if (assets.length !== assetIds.length || assets.some((asset) => asset.assignedUserId !== current.recipientId)) {
        throw new ApiError(409, 'Qurilmalarning joriy biriktirish holati dalolatnomaga mos emas');
      }
      for (const asset of assets) {
        await tx.asset.update({
          where: { id: asset.id },
          data: { assignedUserId: null, departmentId: destinationId },
        });
        const transaction = await tx.transaction.create({
          data: {
            assetId: asset.id,
            fromUserId: current.recipientId,
            actorId: req.user.id,
            fromDepartmentId: asset.departmentId,
            toDepartmentId: destinationId,
            type: 'RETURN',
            note: `${current.number} dalolatnoma asosida omborxonaga qaytarildi`,
          },
        });
        transactionId ||= transaction.id;
        await auditService.log(
          req.user.id,
          'ASSET_UPDATE',
          'Asset',
          asset.id,
          { assignedUserId: null, departmentId: destinationId, source: 'RETURN_DELIVERY_ACT', deliveryActId: current.id },
          req.ip,
          tx,
        );
      }
    }
    const item = await tx.deliveryAct.update({
      where: { id: current.id },
      data: {
        status: current.snapshot?.type === 'RETURN' ? 'AWAITING_ENGINEER' : 'SIGNED',
        signedAt: new Date(),
        transactionId,
      },
      include: deliveryActInclude,
    });
    await auditService.log(req.user.id, 'DELIVERY_ACT_SIGN', 'DeliveryAct', item.id, { objectName: item.number }, req.ip, tx);
    return item;
  });
  await invalidateDeliveryActDocx(current.id);
  res.json(updated);
}));

router.post('/:id/engineer-confirm', asyncHandler(async (req, res) => {
  const current = await getAllowedAct(req.params.id, req.user);
  if (current.engineerId !== req.user.id) throw new ApiError(403, 'Dalolatnomani faqat tayinlangan TB va XK muhandisi tasdiqlashi mumkin');
  if (current.status !== 'AWAITING_ENGINEER') throw new ApiError(400, 'Dalolatnoma muhandis tasdig‘i bosqichida emas');
  if (!req.body.accepted) throw new ApiError(400, 'Qurilmalar tekshirilganini tasdiqlang');
  const signer = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { department: true, departmentPosition: { include: { position: true } } },
  });
  if (!req.body.password || !(await bcrypt.compare(req.body.password, signer.password))) {
    throw new ApiError(401, 'Parol noto‘g‘ri');
  }
  const snapshotAssets = current.snapshot?.assets || [];
  const isReturn = current.snapshot?.type === 'RETURN';
  const reviews = Array.isArray(req.body.reviews) ? req.body.reviews : [];
  const reviewByAssetId = new Map(reviews.map((review) => [Number(review.assetId), review]));
  if (isReturn && (reviews.length !== snapshotAssets.length || snapshotAssets.some((asset) => {
    const review = reviewByAssetId.get(Number(asset.id));
    return !['GOOD', 'DAMAGED'].includes(review?.condition)
      || (review.condition === 'DAMAGED' && !review.damageNote?.trim());
  }))) {
    throw new ApiError(400, 'Har bir qurilmani tekshiring va shikastlangan qurilmaga izoh kiriting');
  }
  const engineerSnapshot = {
    id: signer.id,
    fullName: signer.fullName,
    position: signer.departmentPosition?.position?.name || 'TB va XK muhandisi',
    department: signer.department?.name || null,
    note: req.body.note?.trim() || null,
  };
  const snapshot = {
    ...current.snapshot,
    engineer: engineerSnapshot,
    assets: isReturn
      ? snapshotAssets.map((asset) => {
        const review = reviewByAssetId.get(Number(asset.id));
        return {
          ...asset,
          condition: review.condition === 'DAMAGED' ? 'Shikastlangan' : 'Soz',
          damageNote: review.damageNote?.trim() || null,
        };
      })
      : snapshotAssets.map((asset) => ({ ...asset, condition: 'Soz, o‘rnatildi' })),
  };
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.deliveryAct.update({
      where: { id: current.id },
      data: {
        status: isReturn ? 'AWAITING_ACCEPTANCE' : 'PENDING',
        engineerConfirmedAt: new Date(),
        snapshot,
        documentText: (isReturn ? buildReturnActText : buildDeliveryActText)({
          number: current.number,
          snapshot,
          createdAt: current.createdAt,
        }),
        documentVersion: { increment: 1 },
      },
      include: deliveryActInclude,
    });
    await auditService.log(req.user.id, 'DELIVERY_ACT_ENGINEER_CONFIRM', 'DeliveryAct', item.id, {
      objectName: item.number,
      type: isReturn ? 'RETURN' : 'ASSIGN',
    }, req.ip, tx);
    return item;
  });
  await invalidateDeliveryActDocx(current.id);
  res.json(updated);
}));

router.post('/:id/accept-return', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const current = await getAllowedAct(req.params.id, req.user);
  if (current.snapshot?.type !== 'RETURN') throw new ApiError(400, 'Bu qaytarish dalolatnomasi emas');
  if (current.status !== 'AWAITING_ACCEPTANCE') throw new ApiError(400, 'Dalolatnoma admin qabuli uchun tayyor emas');
  const signer = await prisma.user.findUnique({
    where: { id: req.user.id },
    include: { department: true, departmentPosition: { include: { position: true } } },
  });
  if (!req.body.password || !(await bcrypt.compare(req.body.password, signer.password))) {
    throw new ApiError(401, 'Parol noto‘g‘ri');
  }
  const snapshotAssets = current.snapshot.assets || [];
  const reviews = Array.isArray(req.body.reviews) ? req.body.reviews : [];
  const reviewByAssetId = new Map(reviews.map((review) => [Number(review.assetId), review]));
  if (reviews.length !== snapshotAssets.length || snapshotAssets.some((asset) => {
    const review = reviewByAssetId.get(Number(asset.id));
    return !['GOOD', 'DAMAGED'].includes(review?.condition)
      || (review.condition === 'DAMAGED' && !review.damageNote?.trim());
  })) {
    throw new ApiError(400, 'Har bir qurilma holatini tekshiring va shikastlangan qurilmaga izoh kiriting');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const assetIds = snapshotAssets.map((asset) => Number(asset.id));
    const destinationId = Number(current.snapshot.destination?.id);
    const assets = await tx.asset.findMany({ where: { id: { in: assetIds } } });
    if (!Number.isInteger(destinationId)
      || assets.length !== assetIds.length
      || assets.some((asset) => asset.assignedUserId !== current.recipientId)) {
      throw new ApiError(409, 'Qurilmalarning joriy biriktirish holati dalolatnomaga mos emas');
    }
    let transactionId = current.transactionId;
    for (const asset of assets) {
      const review = reviewByAssetId.get(asset.id);
      const status = review.condition === 'DAMAGED' ? 'BROKEN' : 'ACTIVE';
      await tx.asset.update({
        where: { id: asset.id },
        data: { assignedUserId: null, departmentId: destinationId, status },
      });
      const transaction = await tx.transaction.create({
        data: {
          assetId: asset.id,
          fromUserId: current.recipientId,
          actorId: req.user.id,
          fromDepartmentId: asset.departmentId,
          toDepartmentId: destinationId,
          type: 'RETURN',
          note: review.condition === 'DAMAGED'
            ? `${current.number}: shikastlangan — ${review.damageNote.trim()}`
            : `${current.number}: soz holatda omborxonaga qaytarildi`,
        },
      });
      transactionId ||= transaction.id;
      await auditService.log(req.user.id, 'ASSET_UPDATE', 'Asset', asset.id, {
        assignedUserId: null,
        departmentId: destinationId,
        status,
        damageNote: review.damageNote?.trim() || null,
        source: 'RETURN_DELIVERY_ACT_ACCEPTANCE',
        deliveryActId: current.id,
      }, req.ip, tx);
    }
    const snapshot = {
      ...current.snapshot,
      assets: snapshotAssets.map((asset) => {
        const review = reviewByAssetId.get(Number(asset.id));
        return {
          ...asset,
          condition: review.condition === 'DAMAGED' ? 'Shikastlangan' : 'Soz',
          damageNote: review.damageNote?.trim() || null,
        };
      }),
      acceptor: {
        id: signer.id,
        fullName: signer.fullName,
        position: signer.departmentPosition?.position?.name || null,
        department: signer.department?.name || null,
      },
    };
    const item = await tx.deliveryAct.update({
      where: { id: current.id },
      data: {
        status: 'SIGNED',
        acceptedAt: new Date(),
        acceptedById: req.user.id,
        transactionId,
        snapshot,
        documentText: buildReturnActText({ number: current.number, snapshot, createdAt: current.createdAt }),
        documentVersion: { increment: 1 },
      },
      include: deliveryActInclude,
    });
    await createCurrentInventoryDeliveryAct(tx, {
      recipientId: current.recipientId,
      creatorId: req.user.id,
    });
    await auditService.log(req.user.id, 'DELIVERY_ACT_RETURN_ACCEPT', 'DeliveryAct', item.id, { objectName: item.number }, req.ip, tx);
    return item;
  });
  await invalidateDeliveryActDocx(current.id);
  res.json(updated);
}));

router.post('/:id/request-revision', asyncHandler(async (req, res) => {
  const current = await getAllowedAct(req.params.id, req.user);
  const reason = req.body.reason?.trim();
  if (!reason) throw new ApiError(400, 'Tuzatishga qaytarish sababini kiriting');
  if (reason.length > 1000) throw new ApiError(400, 'Tuzatish sababi juda uzun');

  const isReturnReview = current.snapshot?.type === 'RETURN'
    && current.status === 'AWAITING_ACCEPTANCE'
    && isSuperAdmin(req.user);
  const isAssignmentReview = current.snapshot?.type !== 'RETURN'
    && current.status === 'PENDING'
    && current.recipientId === req.user.id;
  if (!isReturnReview && !isAssignmentReview) {
    throw new ApiError(403, 'Bu dalolatnomani tuzatishga qaytarish mumkin emas');
  }

  const revision = {
    reason,
    requestedAt: new Date().toISOString(),
    requestedBy: { id: req.user.id, fullName: req.user.fullName },
  };
  const snapshot = {
    ...current.snapshot,
    revisions: [...(current.snapshot.revisions || []), revision],
  };
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.deliveryAct.update({
      where: { id: current.id },
      data: {
        status: isReturnReview ? 'REVISION_REQUESTED' : 'DRAFT',
        signedAt: isReturnReview ? null : current.signedAt,
        sentAt: isAssignmentReview ? null : current.sentAt,
        snapshot,
      },
      include: deliveryActInclude,
    });
    await auditService.log(req.user.id, 'DELIVERY_ACT_REVISION_REQUEST', 'DeliveryAct', item.id, {
      objectName: item.number,
      reason,
    }, req.ip, tx);
    return item;
  });
  res.json(updated);
}));

router.post('/:id/resubmit', asyncHandler(async (req, res) => {
  const current = await getAllowedAct(req.params.id, req.user);
  if (current.snapshot?.type !== 'RETURN'
    || current.status !== 'REVISION_REQUESTED'
    || current.recipientId !== req.user.id) {
    throw new ApiError(403, 'Bu dalolatnomani qayta yuborish mumkin emas');
  }
  await forceSaveDocument(current, req.body.documentKey);
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.deliveryAct.update({
      where: { id: current.id },
      data: { status: 'PENDING', sentAt: new Date() },
      include: deliveryActInclude,
    });
    await auditService.log(req.user.id, 'DELIVERY_ACT_RESUBMIT', 'DeliveryAct', item.id, {
      objectName: item.number,
    }, req.ip, tx);
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
        res.setHeader('Content-Disposition', `inline; filename="${act.number}.pdf"`);
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
