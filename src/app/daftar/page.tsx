'use client';

import { useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function DaftarPage() {
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nama.trim() || !email.trim() || !password) {
      setError('Nama, email, dan kata sandi wajib diisi.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nama: nama.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        }),
      });
      const j = (await res.json().catch(() => null)) as {
        data?: unknown;
        error?: { message?: string };
      } | null;
      if (res.status === 201) {
        setDone(true);
        return;
      }
      setError(j?.error?.message ?? 'Pendaftaran gagal. Silakan coba lagi.');
    } catch {
      setError('Terjadi kesalahan jaringan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Daftar Anggota</h1>
        <p className="mt-1 text-sm text-slate-500">
          Isi formulir di bawah untuk mendaftar sebagai anggota perpustakaan.
        </p>

        {done ? (
          <p
            role="status"
            className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          >
            Pendaftaran diterima, menunggu aktivasi pustakawan.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <Input
              id="daftar-nama"
              label="Nama lengkap"
              type="text"
              autoComplete="name"
              required
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Nama lengkap"
            />
            <Input
              id="daftar-email"
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.id"
            />
            <Input
              id="daftar-password"
              label="Kata sandi"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
            />
            <Input
              id="daftar-phone"
              label="Telepon (opsional)"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xxxxxxxxxx"
            />
            <Input
              id="daftar-address"
              label="Alamat (opsional)"
              type="text"
              autoComplete="street-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Alamat domisili"
            />

            {error && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} fullWidth>
              Daftar
            </Button>
          </form>
        )}

        <Link href="/login" className="mt-4 inline-block text-sm text-brand hover:underline">
          Sudah punya akun? Masuk
        </Link>
      </div>
    </main>
  );
}
