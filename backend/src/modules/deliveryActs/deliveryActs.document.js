import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import QRCode from 'qrcode';
import { env } from '../../config/env.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const storageDir = env.deliveryActStorageDir
  ? path.resolve(env.deliveryActStorageDir)
  : path.resolve(currentDir, '../../../uploads/delivery-acts');

const htmlToText = (input) => String(input)
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li|h1|h2|h3)>/gi, '\n')
  .replace(/<li[^>]*>/gi, '• ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#39;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export const deliveryActFilePath = (id) => path.join(storageDir, `delivery-act-${Number(id)}.docx`);

const wordText = (value) => String(value || '________________');
const wordParagraph = (text, options = {}) => new Paragraph({
  alignment: options.alignment || AlignmentType.JUSTIFIED,
  spacing: { before: options.before ?? 0, after: options.after ?? 120, line: 300 },
  indent: options.firstLine ? { firstLine: 709 } : undefined,
  children: [new TextRun({
    text,
    font: 'Times New Roman',
    size: options.size || 24,
    bold: Boolean(options.bold),
    italics: Boolean(options.italic),
  })],
});
const tableCell = (text, bold = false) => new TableCell({
  children: [wordParagraph(wordText(text), { bold, size: 20, alignment: AlignmentType.CENTER, after: 40 })],
});

const hiddenBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const dateAndLocationTable = (createdAt) => new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: hiddenBorders,
  rows: [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: hiddenBorders,
          children: [wordParagraph(new Date(createdAt).toLocaleDateString('uz-UZ'), {
            alignment: AlignmentType.LEFT,
            after: 300,
          })],
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: hiddenBorders,
          children: [wordParagraph('Toshkent shahri', {
            alignment: AlignmentType.RIGHT,
            after: 300,
          })],
        }),
      ],
    }),
  ],
});

const stageSignature = (act, stage, timestamp) => crypto
  .createHmac('sha256', env.jwtSecret)
  .update(`${act.id}:${act.number}:${stage}:${new Date(timestamp).toISOString()}`)
  .digest('base64url');

const stageQrUrl = (act, stage, timestamp) => `${env.clientUrl.replace(/\/$/, '')}/verify-delivery-act/${act.id}?token=${encodeURIComponent(`stage.${stage}.${stageSignature(act, stage, timestamp)}`)}`;
const signatureDate = (timestamp) => new Intl.DateTimeFormat('uz-UZ', {
  timeZone: 'Asia/Tashkent',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
}).format(new Date(timestamp));

const signatureTable = async (act) => {
  const snapshot = act.snapshot || {};
  const isReturn = snapshot.type === 'RETURN';
  const signatures = isReturn ? [
    { stage: 'recipient', label: 'Moddiy qimmatliklarni topshirdi:', person: snapshot.recipient, timestamp: act.signedAt },
    { stage: 'engineer', label: '', person: snapshot.engineer, timestamp: act.engineerConfirmedAt },
    { stage: 'acceptor', label: 'Moddiy qimmatliklarni qabul qildi:', person: snapshot.acceptor || snapshot.creator, timestamp: act.acceptedAt },
  ] : [
    { stage: 'creator', label: 'Moddiy qimmatliklarni topshirdi:', person: snapshot.creator, timestamp: act.sentAt },
    { stage: 'engineer', label: '', person: snapshot.engineer, timestamp: act.engineerConfirmedAt },
    { stage: 'recipient', label: 'Moddiy qimmatliklarni qabul qildi:', person: snapshot.recipient, timestamp: act.signedAt },
  ];
  const rows = await Promise.all(signatures.map(async ({ stage, label, person, timestamp }) => {
    const middleChildren = timestamp ? [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({
          data: await QRCode.toBuffer(stageQrUrl(act, stage, timestamp), { width: 260, margin: 1 }),
          transformation: { width: 82, height: 82 },
          type: 'png',
        })],
      }),
      wordParagraph(`${act.number} | ${signatureDate(timestamp)}`, { size: 14, alignment: AlignmentType.CENTER, after: 20 }),
    ] : [wordParagraph('(imzo) {QR code}', { alignment: AlignmentType.CENTER, after: 20 })];
    return new TableRow({
      children: [
        new TableCell({
          borders: hiddenBorders,
          width: { size: 40, type: WidthType.PERCENTAGE },
          children: [wordParagraph(label, { size: 22, after: 20 })],
        }),
        new TableCell({
          borders: hiddenBorders,
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: middleChildren,
        }),
        new TableCell({
          borders: hiddenBorders,
          width: { size: 35, type: WidthType.PERCENTAGE },
          children: [
            wordParagraph(wordText(person?.fullName), { size: 22, alignment: AlignmentType.CENTER, after: 80 }),
            wordParagraph(wordText(person?.position), { size: 20, alignment: AlignmentType.CENTER, after: 20 }),
          ],
        }),
      ],
    });
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: hiddenBorders,
    rows,
  });
};

const structuredChildren = async (act) => {
  const snapshot = act.snapshot;
  const assets = snapshot.assets?.length ? snapshot.assets : [snapshot.asset];
  const rows = [
    new TableRow({
      tableHeader: true,
      children: ['№', 'Qurilma', 'Model', 'Inventar raqami', 'Yili', 'Holati']
        .map((heading) => tableCell(heading, true)),
    }),
    ...assets.map((asset, index) => new TableRow({
      children: [
        index + 1,
        asset.name,
        asset.model,
        asset.inventoryNumber,
        asset.manufactureYear,
        asset.condition || 'Yaxshi',
      ].map((item) => tableCell(item)),
    })),
  ];
  const introduction = `${wordText(snapshot.organization?.name)}ning ${wordText(snapshot.creator?.department)} ${wordText(snapshot.creator?.position)} ${wordText(snapshot.creator?.fullName)} hamda ${wordText(snapshot.engineer?.position || 'TB va XK muhandisi')} ${wordText(snapshot.engineer?.fullName)} tomonidan ${wordText(snapshot.recipient?.department)} ${wordText(snapshot.recipient?.position)} ${wordText(snapshot.recipient?.fullName)}ga quyidagi qurilma va moddiy qimmatliklar xizmatda foydalanish uchun topshirdi.`;
  const reminder = 'Eslatma: Qurilma va moddiy qimmatliklarni qabul qilib olgan foydalanuvchi mol-mulklarning butligini saqlashi, tejamkor munosabatda bo‘lishi, qabul qilib olingan qurilmalarni mas’ul xodimning ruxsatisiz boshqa xodimlarga yoki uchinchi shaxslarga foydalanish uchun topshirmasligi, qurilmalardan foydalanishda xavfsizlik va texnik foydalanish qoidalariga rioya qilishi lozim.';
  const liability = 'Moddiy qimmatliklar yo‘qolgan, kam chiqqan yoki qasddan shikast yetkazilganligi aniqlangan hollarda yetkazilgan zararni qonunchilikda belgilangan tartibda qoplashi bo‘yicha to‘liq moddiy javobgarlikni o‘z zimmasiga oladi.';
  return [
    wordParagraph(`№: ${act.number}`, { alignment: AlignmentType.RIGHT, after: 120 }),
    wordParagraph('D A L O L A T N O M A', { bold: true, alignment: AlignmentType.CENTER, after: 0 }),
    wordParagraph('Moddiy qimmatliklarni topshirish va qabul qilish to‘g‘risida', { italic: true, alignment: AlignmentType.CENTER, after: 220 }),
    dateAndLocationTable(act.createdAt),
    wordParagraph(introduction, { firstLine: true, after: 0 }),
    wordParagraph(reminder, { italic: true, firstLine: true, after: 0 }),
    wordParagraph(liability, { italic: true, firstLine: true, after: 300 }),
    wordParagraph('Moddiy qimmatliklar ro‘yxati:', { bold: true, italic: true, after: 0 }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    wordParagraph('Dalolatnoma bilan tanishib, to‘g‘ri deb, o‘z ERI imzosi bilan tasdiqlovchilar:', { before: 300, after: 160 }),
    await signatureTable(act),
  ];
};

const structuredReturnChildren = async (act) => {
  const snapshot = act.snapshot;
  const assets = snapshot.assets?.length ? snapshot.assets : [snapshot.asset];
  const rows = [
    new TableRow({
      tableHeader: true,
      children: ['№', 'Qurilma', 'Model', 'Inventar raqami', 'Yili', 'Holati', 'Shikast / izoh']
        .map((heading) => tableCell(heading, true)),
    }),
    ...assets.map((asset, index) => new TableRow({
      children: [
        index + 1,
        asset.name,
        asset.model,
        asset.inventoryNumber,
        asset.manufactureYear,
        asset.condition || 'Tekshirilmagan',
        asset.damageNote || 'Shikast qayd etilmagan',
      ].map((item) => tableCell(item)),
    })),
  ];
  const acceptingPerson = snapshot.acceptor || snapshot.creator;
  const introduction = `${wordText(snapshot.organization?.name)}ning ${wordText(snapshot.recipient?.department)} ${wordText(snapshot.recipient?.position)} ${wordText(snapshot.recipient?.fullName)} foydalanishidagi quyidagi qurilma va moddiy qimmatliklarni o‘z xohishi bilan ${wordText(snapshot.engineer?.position || 'TB va XK muhandisi')} ${wordText(snapshot.engineer?.fullName)} va ${wordText(acceptingPerson?.department)} ${wordText(acceptingPerson?.position)} ${wordText(acceptingPerson?.fullName)} orqali ${wordText(snapshot.destination?.name)}ga qaytarildi.`;
  const inspectionNote = 'Eslatma: Qaytarilayotgan qurilma va moddiy qimmatliklar texnik xodim tomonidan tashqi ko‘rikdan o‘tkaziladi hamda qabul qiluvchi mas’ul xodim tomonidan ularning holati yakuniy tekshiriladi.';
  const damageNote = 'Qurilmalarda nosozlik, butlikning buzilishi yoki shikastlanish aniqlangan taqdirda, uning holati va aniqlangan kamchiliklar dalolatnomada qayd etiladi.';
  return [
    wordParagraph(`№: ${act.number}`, { alignment: AlignmentType.RIGHT, after: 120 }),
    wordParagraph('D A L O L A T N O M A', { bold: true, alignment: AlignmentType.CENTER, after: 0 }),
    wordParagraph('Moddiy qimmatliklarni qaytarish va qabul qilish to‘g‘risida', { italic: true, alignment: AlignmentType.CENTER, after: 220 }),
    dateAndLocationTable(act.createdAt),
    wordParagraph(introduction, { firstLine: true, after: 0 }),
    wordParagraph(inspectionNote, { italic: true, firstLine: true, after: 0 }),
    wordParagraph(damageNote, { italic: true, firstLine: true, after: 300 }),
    wordParagraph('Qaytarilayotgan moddiy qimmatliklar ro‘yxati:', { bold: true, italic: true, after: 0 }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    wordParagraph('Dalolatnoma bilan tanishib, to‘g‘ri deb, o‘z ERI imzosi bilan tasdiqlovchilar:', { before: 300, after: 160 }),
    await signatureTable(act),
  ];
};

export const ensureDeliveryActDocx = async (act) => {
  const target = deliveryActFilePath(act.id);
  try {
    await fs.access(target);
    return target;
  } catch {
    await fs.mkdir(storageDir, { recursive: true });
  }
  const lines = htmlToText(act.documentText).split('\n');
  const children = act.snapshot?.assets?.length
    ? await (act.snapshot?.type === 'RETURN' ? structuredReturnChildren(act) : structuredChildren(act))
    : lines.map((line, index) => new Paragraph({
      alignment: index < 2 ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
      spacing: { after: line ? 120 : 200, line: 300 },
      children: [new TextRun({
        text: line || ' ',
        font: 'Times New Roman',
        size: 24,
        bold: index < 2,
      })],
    }));
  const document = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        },
      },
      children,
    }],
  });
  await fs.writeFile(target, await Packer.toBuffer(document));
  return target;
};

export const saveDeliveryActDocx = async (id, buffer) => {
  await fs.mkdir(storageDir, { recursive: true });
  await fs.writeFile(deliveryActFilePath(id), buffer);
};

export const invalidateDeliveryActDocx = async (id) => {
  try {
    await fs.unlink(deliveryActFilePath(id));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

const signatureFor = (id, expiresAt) => crypto
  .createHmac('sha256', env.jwtSecret)
  .update(`${Number(id)}:${expiresAt}`)
  .digest('base64url');

export const createDocumentAccessToken = (id, ttlMs = 60 * 60 * 1000) => {
  const expiresAt = Date.now() + ttlMs;
  return `${expiresAt}.${signatureFor(id, expiresAt)}`;
};

export const verifyDocumentAccessToken = (id, token) => {
  const [expiresAtValue, signature] = String(token || '').split('.');
  const expiresAt = Number(expiresAtValue);
  if (!expiresAt || expiresAt < Date.now() || !signature) return false;
  const expected = signatureFor(id, expiresAt);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

const verificationSignatureFor = (act) => crypto
  .createHmac('sha256', env.jwtSecret)
  .update(`${act.id}:${act.number}:${new Date(act.signedAt).toISOString()}`)
  .digest('base64url');

export const createDeliveryActVerificationToken = (act) => verificationSignatureFor(act);

export const verifyDeliveryActVerificationToken = (act, token) => {
  if (!act?.signedAt || !token) return false;
  const expectedBuffer = Buffer.from(verificationSignatureFor(act));
  const actualBuffer = Buffer.from(String(token));
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

export const verifyDeliveryActStageToken = (act, token) => {
  const [, stage, signature] = String(token || '').split('.');
  const timestampByStage = {
    creator: act.sentAt,
    engineer: act.engineerConfirmedAt,
    recipient: act.signedAt,
    acceptor: act.acceptedAt,
  };
  const timestamp = timestampByStage[stage];
  if (!stage || !signature || !timestamp) return null;
  const expectedBuffer = Buffer.from(stageSignature(act, stage, timestamp));
  const actualBuffer = Buffer.from(signature);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  return { stage, timestamp };
};
