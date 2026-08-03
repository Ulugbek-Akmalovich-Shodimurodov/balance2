import dotenv from 'dotenv';
dotenv.config();
export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  additionalClientUrls: (process.env.ADDITIONAL_CLIENT_URLS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  onlyOfficePublicUrl: process.env.ONLYOFFICE_PUBLIC_URL || 'http://localhost:8082',
  onlyOfficeBackendUrl: process.env.ONLYOFFICE_BACKEND_URL || 'http://host.docker.internal:5000',
  onlyOfficeJwtSecret: process.env.ONLYOFFICE_JWT_SECRET || '',
  deliveryActStorageDir: process.env.DELIVERY_ACT_STORAGE_DIR || '',
};

if (env.nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-super-secret') {
    throw new Error('Production uchun xavfsiz JWT_SECRET majburiy');
  }
  if (!env.onlyOfficeJwtSecret) {
    throw new Error('Production uchun ONLYOFFICE_JWT_SECRET majburiy');
  }
}
