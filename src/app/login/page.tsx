'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

/** Validasi redirect internal saja (cegah open-redirect). */
function safeNext(raw: string | null): string {
  if (!raw) return '/admin';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/admin';
  return raw;
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Masuk Anggota / Pustakawan</h1>
        <p className="mt-1 text-sm text-slate-500">
          Masuk sebagai anggota untuk melihat pinjaman &amp; denda Anda, atau sebagai pustakawan
          untuk mengelola perpustakaan.
        </p>

        <Suspense>
          <LoginForm />
        </Suspense>

        <Link href="/" className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Kembali ke beranda
        </Link>
        <p className="mt-2 text-sm text-slate-500">
          Belum punya akun?{' '}
          <Link href="/daftar" className="text-brand hover:underline">
            Daftar sebagai anggota
          </Link>
        </p>
      </div>
    </main>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError('Email atau kata sandi salah. Silakan coba lagi.');
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError('Terjadi kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3">
      <Input
        id="login-email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="admin@perpus.id"
      />

      <Input
        id="login-password"
        label="Kata sandi"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
      />

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <Button type="submit" loading={loading} fullWidth>
        Masuk
      </Button>
    </form>
  );
}
