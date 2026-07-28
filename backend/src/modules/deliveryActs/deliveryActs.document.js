import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
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
  spacing: { after: options.after ?? 120, line: 300 },
  children: [new TextRun({
    text,
    font: 'Times New Roman',
    size: options.size || 24,
    bold: Boolean(options.bold),
  })],
});
const tableCell = (text, bold = false) => new TableCell({
  children: [wordParagraph(wordText(text), { bold, size: 20, alignment: AlignmentType.CENTER, after: 40 })],
});

const structuredChildren = (act) => {
  const snapshot = act.snapshot;
  const assets = snapshot.assets?.length ? snapshot.assets : [snapshot.asset];
  const rows = [
    new TableRow({
      tableHeader: true,
      children: ['№', 'Qurilma', 'Model', 'Inventar raqami', 'Seriya raqami', 'Holati']
        .map((heading) => tableCell(heading, true)),
    }),
    ...assets.map((asset, index) => new TableRow({
      children: [
        index + 1,
        asset.name,
        asset.model,
        asset.inventoryNumber,
        asset.serialNumber,
        asset.condition || 'Yaxshi',
      ].map((item) => tableCell(item)),
    })),
  ];
  return [
    wordParagraph('QURILMANI TOPSHIRISH-QABUL QILISH', { bold: true, alignment: AlignmentType.CENTER }),
    wordParagraph('DALOLATNOMASI', { bold: true, alignment: AlignmentType.CENTER, after: 260 }),
    wordParagraph(`Dalolatnoma raqami: ${act.number}`),
    wordParagraph(`Tuzilgan sana: ${new Date(act.createdAt).toLocaleDateString('uz-UZ')}`, { after: 220 }),
    wordParagraph(`Biz, quyida imzo qo‘yuvchilar, topshiruvchi ${wordText(snapshot.creator?.fullName)} va qabul qiluvchi ${wordText(snapshot.recipient?.fullName)}, ushbu dalolatnomani quyidagilar haqida tuzdik:`, { after: 240 }),
    wordParagraph('1. QABUL QILUVCHI XODIM TO‘G‘RISIDA MA’LUMOT', { bold: true, after: 180 }),
    wordParagraph(`F.I.Sh.: ${wordText(snapshot.recipient?.fullName)}`),
    wordParagraph(`Pasport seria raqami: ${wordText(snapshot.recipient?.passportSeries)}`),
    wordParagraph(`JShShIR: ${wordText(snapshot.recipient?.pinfl)}`),
    wordParagraph(`Bo‘lim: ${wordText(snapshot.recipient?.department)}`, { after: 220 }),
    wordParagraph('2. TOPSHIRILAYOTGAN QURILMALAR', { bold: true, after: 160 }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    wordParagraph(' ', { after: 120 }),
    wordParagraph('3. TOMONLARNING TASDIG‘I', { bold: true, after: 180 }),
    wordParagraph('Qabul qiluvchi yuqoridagi qurilmalarni ko‘zdan kechirganini, ma’lumotlar to‘g‘riligini hamda qurilmalarni but holatda qabul qilganini tasdiqlaydi. Qabul qiluvchi ulardan belgilangan maqsadda foydalanish va saqlanishi uchun javobgarlikni o‘z zimmasiga oladi.', { after: 260 }),
    wordParagraph(`Topshiruvchi: ${wordText(snapshot.creator?.fullName)}`),
    wordParagraph('Imzo: ______________________', { after: 220 }),
    wordParagraph(`Qabul qiluvchi: ${wordText(snapshot.recipient?.fullName)}`),
    wordParagraph('Imzo: ______________________', { after: 220 }),
    wordParagraph('Izoh: ____________________________________________________________'),
    wordParagraph('__________________________________________________________________'),
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
    ? structuredChildren(act)
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
