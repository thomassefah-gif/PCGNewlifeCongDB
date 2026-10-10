import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Church, LockKeyhole, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import Button from '../components/ui/Button';
import { useAuth } from '../features/auth/AuthContext';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});
type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [authError, setAuthError] = useState<string | null>(null);
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: LoginValues) => {
    setAuthError(null);
    try {
      await signIn(values.email, values.password);
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(destination || '/dashboard', { replace: true });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-accent px-4 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-soft">
        <div className="bg-primary px-7 py-8 text-center text-white sm:px-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 text-primary">
            {logoUnavailable ? <Church aria-hidden="true" size={30} /> : <img src="/LogoImg/presbylogo.png" alt="Presbyterian Church of Ghana logo" className="h-full w-full object-contain" onError={() => setLogoUnavailable(true)} />}
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight">New Life Congregation</h1>
          <p className="mt-1 text-sm text-white/75">Presbyterian Church of Ghana — Ga West Presbytery</p>
        </div>

        <form className="space-y-5 px-7 py-8 sm:px-10" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Sign in to your account</h2>
            <p className="mt-1 text-sm text-slate-500">Enter your church office credentials to continue.</p>
          </div>

          {authError && <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-3.5 py-3 text-sm text-danger">{authError}</p>}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">Email address</label>
            <div className="relative">
              <Mail aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                {...register('email')}
                aria-invalid={Boolean(errors.email)}
                className="h-11 w-full rounded-xl border border-stone-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-danger"
                placeholder="name@example.com"
              />
            </div>
            {errors.email && <p className="mt-1.5 text-xs text-danger">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
            <div className="relative">
              <LockKeyhole aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
                aria-invalid={Boolean(errors.password)}
                className="h-11 w-full rounded-xl border border-stone-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-danger"
                placeholder="Enter your password"
              />
            </div>
            {errors.password && <p className="mt-1.5 text-xs text-danger">{errors.password.message}</p>}
          </div>

          <Button type="submit" size="lg" loading={isSubmitting} className="w-full">Sign in</Button>
          <p className="text-center text-xs leading-5 text-slate-500">Access is limited to authorized church staff and administrators.</p>
        </form>
      </section>
    </main>
  );
}
