import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transport = null;

// Tests (and any custom provider) can inject a transport with a `sendMail` method.
export function setMailTransport(t) {
  transport = t;
}

export const isMailConfigured = () => Boolean(transport || env.SMTP_HOST);

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_PORT === 465, // 465 = implicit TLS; 587 upgrades with STARTTLS
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

export const sendMail = ({ to, subject, text, html }) =>
  getTransport().sendMail({ from: env.ALERT_FROM_EMAIL || env.SMTP_USER, to, subject, text, html });