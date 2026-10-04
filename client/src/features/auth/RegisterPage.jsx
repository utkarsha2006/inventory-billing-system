import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { registerShop } from './authSlice.js';
import { Alert, Button, Card, Field, Input, Select } from '../../components/ui.jsx';
import { GST_TYPES } from '../../utils/constants.js';
import { STATE_OPTIONS } from '../../utils/states.js';

const schema = z
  .object({
    shopName: z.string().trim().min(2, 'Enter the shop name'),
    stateCode: z.string().min(1, 'Choose the shop state'),
    gstRegistrationType: z.enum(GST_TYPES),
    gstin: z.string().trim().toUpperCase(),
    ownerName: z.string().trim().min(2, 'Enter your name'),
    email: z.string().trim().email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Include a letter')
      .regex(/\d/, 'Include a number'),
  })
  .superRefine((v, ctx) => {
    const registered = v.gstRegistrationType !== 'UNREGISTERED';
    if (registered && v.gstin.length !== 15) {
      ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'Enter the 15-character GSTIN' });
    }
    if (!registered && v.gstin) {
      ctx.addIssue({ code: 'custom', path: ['gstin'], message: 'Leave GSTIN empty for an unregistered shop' });
    }
  });

export default function RegisterPage() {
  const dispatch = useDispatch();
  const error = useSelector((s) => s.auth.error);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { gstRegistrationType: 'UNREGISTERED', stateCode: '27', gstin: '' },
  });
  const registered = watch('gstRegistrationType') !== 'UNREGISTERED';

  const onSubmit = async (v) => {
    setBusy(true);
    await dispatch(
      registerShop({
        shop: {
          name: v.shopName,
          stateCode: v.stateCode,
          gstRegistrationType: v.gstRegistrationType,
          ...(v.gstin && { gstin: v.gstin }),
        },
        owner: { name: v.ownerName, email: v.email, password: v.password },
      })
    );
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg space-y-4">
        <h1 className="text-xl font-semibold">Set up your shop</h1>
        {error && <Alert type="error">{error}</Alert>}
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Field label="Shop name" error={errors.shopName?.message} className="sm:col-span-2">
            <Input invalid={!!errors.shopName} {...register('shopName')} />
          </Field>
          <Field label="State" error={errors.stateCode?.message}>
            <Select {...register('stateCode')}>
              {STATE_OPTIONS.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="GST registration">
            <Select {...register('gstRegistrationType')}>
              {GST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0] + t.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          {registered && (
            <Field label="GSTIN" error={errors.gstin?.message} hint="Must start with your state code" className="sm:col-span-2">
              <Input maxLength={15} className="uppercase" invalid={!!errors.gstin} {...register('gstin')} />
            </Field>
          )}
          <Field label="Your name" error={errors.ownerName?.message}>
            <Input invalid={!!errors.ownerName} {...register('ownerName')} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label="Password" error={errors.password?.message} className="sm:col-span-2">
            <Input type="password" autoComplete="new-password" invalid={!!errors.password} {...register('password')} />
          </Field>
          <Button type="submit" className="sm:col-span-2" disabled={busy}>
            {busy ? 'Creating…' : 'Create shop'}
          </Button>
        </form>
        <p className="text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-indigo-600">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}