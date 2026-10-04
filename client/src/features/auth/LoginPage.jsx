import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { login } from './authSlice.js';
import { Alert, Button, Card, Field, Input } from '../../components/ui.jsx';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

export default function LoginPage() {
  const dispatch = useDispatch();
  const error = useSelector((s) => s.auth.error);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    setBusy(true);
    await dispatch(login(values));
    setBusy(false); // on success this page unmounts (GuestOnly redirects)
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Sign in</h1>
        {error && <Alert type="error">{error}</Alert>}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" autoComplete="email" invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label="Password" error={errors.password?.message}>
            <Input type="password" autoComplete="current-password" invalid={!!errors.password} {...register('password')} />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="text-center text-sm text-slate-500">
          New shop?{' '}
          <Link to="/register" className="font-medium text-indigo-600">
            Create an account
          </Link>
        </p>
      </Card>
    </div>
  );
}