'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Breadcrumb from '@/components/public/Breadcrumb';
import { LoanCard, ReservationCard } from '@/components/public/ReservationCard';
import WishlistButton from '@/components/public/WishlistButton';
import { getWishlist } from '@/lib/wishlist';
import {
  cancelMyReservation,
  fetchMyLoans,
  fetchMyReservations,
  ReservasiSayaError,
  type MyLoan,
  type MyReservation,
} from '@/lib/reservations-client';

const CACHE_RES_KEY = 'roi4-reservasi-saya:reservations';
const CACHE_LOAN_KEY = 'roi4-reservasi-saya:loans';

function errCode(e: unknown): string | null {
  return e instanceof ReservasiSayaError ? e.code : null;
}

function readCache(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** S-roi4: Reservasi & pinjaman saya — daftar milik sendiri + batal 1-klik. */
export default function ReservasiSayaPage() {
  const [reservations, setReservations] = useState<MyReservation[]>([]);
  const [loans, setLoans] = useState<MyLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [offline, setOffline] = useState(false);
  const [usedCache, setUsedCache] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setNotice('');
    setOffline(false);
    setUsedCache(false);
    try {
      // No-store fetch milik sendiri (helper tanpa member_id — anti-bocor).
      const [resR, resL] = await Promise.allSettled([
        fetchMyReservations({ fetchLike: fetch }),
        fetchMyLoans({ fetchLike: fetch }),
      ]);

      if (resR.status === 'rejected') {
        const code = errCode(resR.reason);
        if (code === 'UNAUTHENTICATED') {
          setNeedLogin(true);
          setReservations([]);
          setLoans([]);
          return;
        }
        if (code === 'OFFLINE') {
          const cached = readCache(CACHE_RES_KEY) as MyReservation[];
          const cachedLoans = readCache(CACHE_LOAN_KEY) as MyLoan[];
          setReservations(cached);
          setLoans(cachedLoans);
          setOffline(true);
          setUsedCache(cached.length > 0 || cachedLoans.length > 0);
          return;
        }
        throw resR.reason instanceof Error ? resR.reason : new Error('Gagal memuat reservasi.');
      }
      setNeedLogin(false);
      setReservations(resR.value);
      try {
        localStorage.setItem(CACHE_RES_KEY, JSON.stringify(resR.value));
      } catch {
        /* abaikan */
      }

      if (resL.status === 'fulfilled') {
        setLoans(resL.value);
        try {
          localStorage.setItem(CACHE_LOAN_KEY, JSON.stringify(resL.value));
        } catch {
          /* abaikan */
        }
      } else {
        const code = errCode(resL.reason);
        if (code === 'UNAUTHENTICATED') {
          setNeedLogin(true);
          return;
        }
        // Pinjaman best-effort: 403 staff-gated / offline -> kosong ramah, tanpa bocor.
        setLoans([]);
        if (code === 'OFFLINE') {
          const cachedLoans = readCache(CACHE_LOAN_KEY) as MyLoan[];
          if (cachedLoans.length > 0) {
            setLoans(cachedLoans);
            setOffline(true);
            setUsedCache(true);
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    setWishlist(getWishlist());
  }, [load]);

  async function onCancel(id: string) {
    if (cancellingId) return;
    setCancellingId(id);
    setError('');
    setNotice('');
    try {
      // Batal → confirm sudah di kartu → PUT ?id= {status:cancelled} 200.
      // Activity log "reservations.cancelled" ditulis server (best-effort).
      const updated = await cancelMyReservation({ fetchLike: fetch }, { id });
      setReservations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: updated.status ?? 'cancelled' } : r))
      );
      setNotice('Reservasi dibatalkan.');
    } catch (e) {
      const code = errCode(e);
      if (code === 'UNAUTHENTICATED') {
        setNeedLogin(true);
        return;
      }
      setError(e instanceof Error ? e.message : 'Gagal membatalkan.');
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="grid gap-5">
      <Breadcrumb items={[{ label: 'Beranda', href: '/' }, { label: 'Reservasi Saya' }]} />
      <div>
        <h1 className="text-2xl font-bold">Reservasi &amp; Pinjaman Saya</h1>
        <p className="text-sm text-slate-500">
          Pantau status reservasi dan pinjaman aktif Anda tanpa chat WA. Batalkan reservasi menunggu
          dalam 1-klik.
        </p>
      </div>

      {needLogin && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Silakan{' '}
          <a className="font-semibold underline" href="/login?next=/reservasi-saya">
            login
          </a>{' '}
          sebagai anggota untuk melihat reservasi Anda.
        </div>
      )}

      {offline && (
        <div
          role="alert"
          className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700"
        >
          {usedCache
            ? 'Anda offline — menampilkan data terakhir yang tersimpan.'
            : 'Anda offline — tidak ada data tersimpan.'}{' '}
          <button
            type="button"
            onClick={() => void load()}
            className="ml-1 font-semibold text-brand underline-offset-2 hover:underline"
          >
            Muat ulang
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {notice && (
        <p role="status" className="text-sm font-medium text-emerald-700">
          {notice}
        </p>
      )}

      {!needLogin && !offline && (
        <div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            Muat ulang
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500" aria-live="polite">
          Memuat…
        </p>
      ) : needLogin ? null : (
        <>
          <section aria-labelledby="roi4-reservations-h" className="grid gap-3">
            <h2 id="roi4-reservations-h" className="text-lg font-bold">
              Reservasi saya ({reservations.length})
            </h2>
            {reservations.length === 0 ? (
              <div className="grid gap-2">
                <p className="text-sm text-slate-500">
                  Belum ada reservasi. Temukan buku favorit Anda di katalog lalu reservasi dalam
                  1-klik.
                </p>
                <p>
                  <Link
                    href="/katalog"
                    className="font-semibold text-brand underline-offset-2 hover:underline"
                  >
                    Jelajahi katalog
                  </Link>
                </p>
              </div>
            ) : (
              <ul className="grid gap-3">
                {reservations.map((r) => (
                  <ReservationCard
                    key={r.id}
                    row={r}
                    cancelling={cancellingId === r.id}
                    onCancel={(id) => void onCancel(id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="roi4-loans-h" className="grid gap-3">
            <h2 id="roi4-loans-h" className="text-lg font-bold">
              Pinjaman aktif ({loans.length})
            </h2>
            {loans.length === 0 ? (
              <div className="grid gap-2">
                <p className="text-sm text-slate-500">
                  Tidak ada pinjaman aktif. Lihat koleksi yang tersedia dan pinjam lewat petugas
                  sirkulasi.
                </p>
                <p>
                  <Link
                    href="/katalog"
                    className="font-semibold text-brand underline-offset-2 hover:underline"
                  >
                    Jelajahi katalog
                  </Link>
                </p>
              </div>
            ) : (
              <ul className="grid gap-3">
                {loans.map((l) => (
                  <LoanCard key={l.id} row={l} />
                ))}
              </ul>
            )}
          </section>
          {/* S-roi11 Wishlist Simpanku (localStorage, klien saja) */}
          <section aria-labelledby="roi11-wishlist-h" className="grid gap-3">
            <h2 id="roi11-wishlist-h" className="text-lg font-bold">
              Wishlist Simpanku ({wishlist.length})
            </h2>
            {wishlist.length === 0 ? (
              <p className="text-sm text-slate-500">
                Belum ada buku tersimpan. Tandai buku favorit dengan tombol Simpanku di katalog.
              </p>
            ) : (
              <ul className="grid gap-2">
                {wishlist.map((slug) => (
                  <li
                    key={slug}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5"
                  >
                    <Link
                      href={`/katalog/${slug}`}
                      className="min-h-[44px] content-center font-semibold text-brand underline-offset-2 hover:underline"
                    >
                      {slug}
                    </Link>
                    <WishlistButton
                      slug={slug}
                      onChange={(saved) =>
                        saved ? null : setWishlist((prev) => prev.filter((s) => s !== slug))
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
