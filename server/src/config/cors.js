import { env } from './env.js';

export const corsOptions = {
  origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
  credentials: true, // needed so the browser sends the refresh cookie
  exposedHeaders: ['Content-Disposition'], // lets the browser read the PDF filename
};