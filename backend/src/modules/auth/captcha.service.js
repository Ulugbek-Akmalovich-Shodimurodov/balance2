import crypto from 'crypto';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const captchaLength = 5;
const ttlMs = 5 * 60 * 1000;

const hmac = (value) => crypto
  .createHmac('sha256', env.jwtSecret)
  .update(value)
  .digest('base64url');

const randomCode = () => Array.from(
  { length: captchaLength },
  () => alphabet[crypto.randomInt(0, alphabet.length)]
).join('');

const escapeXml = (value) => value.replace(/[<>&'"]/g, (character) => ({
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  "'": '&apos;',
  '"': '&quot;',
}[character]));

const buildSvg = (code) => {
  const glyphs = [...code].map((character, index) => {
    const x = 30 + index * 39 + crypto.randomInt(-3, 4);
    const y = 48 + crypto.randomInt(-5, 6);
    const rotation = crypto.randomInt(-14, 15);
    return `<text x="${x}" y="${y}" transform="rotate(${rotation} ${x} ${y})">${escapeXml(character)}</text>`;
  }).join('');
  const lines = Array.from({ length: 5 }, () => {
    const color = `hsl(${crypto.randomInt(190, 250)} 35% 55%)`;
    return `<path d="M ${crypto.randomInt(0, 35)} ${crypto.randomInt(10, 60)} Q ${crypto.randomInt(65, 145)} ${crypto.randomInt(0, 70)} ${crypto.randomInt(180, 230)} ${crypto.randomInt(10, 60)}" stroke="${color}" stroke-width="1.3" fill="none" opacity=".65"/>`;
  }).join('');
  const dots = Array.from({ length: 38 }, () => (
    `<circle cx="${crypto.randomInt(5, 235)}" cy="${crypto.randomInt(5, 65)}" r="${crypto.randomInt(1, 3)}" fill="#7892a8" opacity=".35"/>`
  )).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="70" viewBox="0 0 240 70"><rect width="240" height="70" rx="10" fill="#f1f6fa"/>${dots}${lines}<g fill="#173b57" font-family="Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="5">${glyphs}</g></svg>`;
};

export const captchaService = {
  create() {
    const answer = randomCode();
    const nonce = crypto.randomBytes(18).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      nonce,
      answerHash: hmac(`${nonce}:${answer}`),
      expiresAt: Date.now() + ttlMs,
    })).toString('base64url');
    const captchaToken = `${payload}.${hmac(payload)}`;
    const image = `data:image/svg+xml;base64,${Buffer.from(buildSvg(answer)).toString('base64')}`;
    return { captchaToken, image, expiresIn: Math.floor(ttlMs / 1000) };
  },

  verify(captchaToken, captchaAnswer) {
    try {
      const [payload, signature] = captchaToken.split('.');
      if (!payload || !signature) throw new Error('invalid');
      const expectedSignature = hmac(payload);
      const signatureBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);
      if (
        signatureBuffer.length !== expectedBuffer.length
        || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
      ) throw new Error('invalid');
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!data.expiresAt || data.expiresAt < Date.now()) {
        throw new ApiError(400, 'CAPTCHA muddati tugagan. Yangilang.');
      }
      const submittedHash = hmac(`${data.nonce}:${captchaAnswer.trim().toUpperCase()}`);
      const submittedBuffer = Buffer.from(submittedHash);
      const answerBuffer = Buffer.from(data.answerHash || '');
      if (
        submittedBuffer.length !== answerBuffer.length
        || !crypto.timingSafeEqual(submittedBuffer, answerBuffer)
      ) throw new ApiError(400, 'CAPTCHA kodi noto‘g‘ri');
      return true;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, 'CAPTCHA yaroqsiz. Yangilang.');
    }
  },
};
