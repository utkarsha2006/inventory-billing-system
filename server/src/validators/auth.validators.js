import { z } from 'zod';
import { GST_REGISTRATION_TYPES } from '../config/constants.js';
import { gstProfileIssues } from '../utils/gstin.js';
import { optional, phoneSchema, emailSchema, passwordSchema } from './common.validators.js';
import { shopFields } from './shop.validators.js';

export const registerShopSchema = z.object({
  shop: z
    .object({
      ...shopFields,
      gstRegistrationType: z.enum(GST_REGISTRATION_TYPES).default('UNREGISTERED'),
    })
    .superRefine((shop, ctx) => {
      for (const issue of gstProfileIssues(shop)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
      }
    }),
  owner: z.object({
    name: z.string().trim().min(2, 'Name is required').max(80),
    email: emailSchema,
    phone: optional(phoneSchema),
    password: passwordSchema,
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});