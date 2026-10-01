import { z } from 'zod';
import { ROLES } from '../config/constants.js';
import { optional, phoneSchema, emailSchema, passwordSchema } from './common.validators.js';

// OWNER can never be assigned through the API.
const assignableRole = z.enum([ROLES.MANAGER, ROLES.CASHIER]);

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: emailSchema,
  phone: optional(phoneSchema),
  password: passwordSchema,
  role: assignableRole,
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    phone: phoneSchema,
    role: assignableRole,
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');

export const resetPasswordSchema = z.object({ newPassword: passwordSchema });