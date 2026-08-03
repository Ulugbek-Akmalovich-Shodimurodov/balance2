import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/errorHandler.js';
import routes from './routes/index.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = new Set([env.clientUrl, ...env.additionalClientUrls, 'http://localhost:5173', 'http://localhost:3000']);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('CORS ruxsati berilmagan'));
  },
  credentials: true,
}));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, skip: () => env.nodeEnv === 'development' }));
app.use(express.json({ limit: '3mb' }));
app.use(morgan('combined'));
app.use('/api', routes);
app.get('/health', (_, res) => res.json({ ok: true }));
app.use((req, res) => res.status(404).json({ message: 'Endpoint topilmadi' }));
app.use(errorHandler);
export default app;
