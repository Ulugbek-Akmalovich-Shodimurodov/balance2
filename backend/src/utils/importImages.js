import AdmZip from 'adm-zip';
import sharp from 'sharp';
import { ApiError } from './apiError.js';

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const archiveFileName = (value) => String(value || '').replaceAll('\\', '/').split('/').pop().trim();
const key = (value) => String(value || '').trim().toLocaleLowerCase('uz');

export const readImageArchive = (buffer) => {
  if (!buffer) return { entries: new Map(), duplicateNames: new Set(), total: 0 };
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new ApiError(400, 'Rasmlar ZIP faylini o‘qib bo‘lmadi yoki fayl buzilgan');
  }
  const files = zip.getEntries().filter((entry) => !entry.isDirectory);
  if (files.length > 20000) throw new ApiError(400, 'ZIP faylda 20 000 tadan ortiq fayl bo‘lishi mumkin emas');
  const uncompressedSize = files.reduce((sum, entry) => sum + Number(entry.header?.size || 0), 0);
  if (uncompressedSize > 250 * 1024 * 1024) throw new ApiError(400, 'ZIP ochilgandagi umumiy hajm 250 MB dan oshmasligi kerak');
  const entries = new Map();
  const duplicateNames = new Set();
  files.forEach((entry) => {
    const name = archiveFileName(entry.entryName);
    const normalized = key(name);
    if (!name || entries.has(normalized)) duplicateNames.add(normalized);
    else entries.set(normalized, entry);
  });
  return { entries, duplicateNames, total: files.length };
};

export const optimizeArchiveImage = async (entry, profile = false) => {
  if (Number(entry.header?.size || 0) > 8 * 1024 * 1024) throw new Error('Rasm hajmi 8 MB dan katta');
  const extension = `.${archiveFileName(entry.entryName).split('.').pop().toLowerCase()}`;
  if (!imageExtensions.has(extension)) throw new Error('Rasm formati JPG, PNG yoki WEBP bo‘lishi kerak');
  const pipeline = sharp(entry.getData()).rotate();
  const optimized = await (profile
    ? pipeline.resize({ width: 512, height: 512, fit: 'cover', position: 'centre', withoutEnlargement: true })
    : pipeline.resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }))
    .jpeg({ quality: profile ? 84 : 82, progressive: true })
    .toBuffer();
  return `data:image/jpeg;base64,${optimized.toString('base64')}`;
};
