'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import DataTable, { type SortDir } from '@/components/admin/DataTable';
import ConfirmModal from '@/components/admin/ConfirmModal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import StatusBadge from '@/components/ui/StatusBadge';
import { sanitizeIlike } from '@/lib/search';
import { errMsg } from '@/lib/admin-errors';

type Member = {
  id: string;
  user_id: string;
  member_code: string;
  phone: string | null;
  address: string | null;
  status: string;
  profiles?: { full_name: string | null } | null;
  /* Agregat kelayakan checkout dari GET /api/members (isu #56). */
  fines_total?: number | null;
  active_loans?: number | null;
  overdue_loans?: number | null;
};

const fmtRp = (v: number | null | undefined) => `Rp${Number(v ?? 0).toLocaleString('id-ID')}`;

type PickOption = { user_id: string; label: string; sub: string };

// Kolom DataTable -> kunci sort server (/api/members whitelist).
const SORT_KEY_MAP: Record<string, string> = {
  member_code: 'member_code',
  profiles: 'full_name',
  status: 'status',
};

export default function AnggotaPage() {
  const [rows, setRows] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ user_id: '', member_code: '', phone: '', address: '' });
  const [formError, setFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  // Pengganti window.confirm: dialog konfirmasi hapus.
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  // Profile picker (search-as-you-type) — mengisi user_id tanpa paste UUID manual.
  const [pickText, setPickText] = useState('');
  const [pickOptions, setPickOptions] = useState<PickOption[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerListId = useId();

  const load = useCallback(async () => {
    setLoadError('');
    try {
      // Sort ditangani server — bukan client sort halaman-aktif (menyesatkan).
      const q = new URLSearchParams({
        page: String(page),
        per_page: '10',
        q: search,
        ...(sortKey && SORT_KEY_MAP[sortKey] ? { sort: SORT_KEY_MAP[sortKey], order: sortDir } : {}),
      });
      const res = await fetch(`/api/members?${q}`);
      const json = (await res.json().catch(() => ({}))) as {
        data?: Member[];
        pagination?: { totalPages?: number };
      };
      if (!res.ok) throw new Error(errMsg(json, 'Gagal memuat anggota.'));
      setRows(json.data ?? []);
      setTotalPages(json.pagination?.totalPages ?? 1);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [search, page, sortKey, sortDir]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    return () => {
      if (pickTimer.current) clearTimeout(pickTimer.current);
    };
  }, []);

  function runPicker(q: string) {
    if (pickTimer.current) clearTimeout(pickTimer.current);
    const clean = sanitizeIlike(q);
    if (!clean) {
      setPickOptions([]);
      setPickOpen(false);
      return;
    }
    pickTimer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: clean, per_page: '10' });
        const res = await fetch(`/api/members?${params}`);
        if (!res.ok) return;
        const json = (await res.json().catch(() => ({}))) as { data?: Member[] };
        setPickOptions(
          (json.data ?? []).map((m) => ({
            user_id: m.user_id,
            label: m.profiles?.full_name ?? m.member_code,
            sub: m.member_code,
          }))
        );
        setPickOpen(true);
      } catch {
        /* abaikan, pertahankan opsi terakhir */
      }
    }, 300);
  }

  function toggleSort(key: string) {
    setSortDir((prev) => (sortKey === key && prev === 'asc' ? 'desc' : 'asc'));
    setSortKey(key);
    setPage(1);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllMembers() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setActionError('');
    setNotice('');
    if (!form.user_id.trim()) {
      setFormError('Pilih profil anggota lewat pencarian atau isi user_id.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: form.user_id.trim(),
          member_code: form.member_code.trim() || undefined,
          phone: form.phone || null,
          address: form.address || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(errMsg(json));
        return;
      }
      setForm({ user_id: '', member_code: '', phone: '', address: '' });
      setPickText('');
      setPickOptions([]);
      setNotice('Anggota baru ditambahkan.');
      load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row) return;
    setPendingDelete(null);
    setActionError('');
    setLoadError('');
    setNotice('');
    try {
      const res = await fetch(`/api/members/${row.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          setActionError(
            `Anggota ${row.member_code} tidak bisa dihapus: masih punya pinjaman berjalan. Kembalikan dulu semua pinjamannya.`
          );
          return;
        }
        throw new Error(errMsg(json));
      }
      setNotice(`Anggota ${row.member_code} dihapus.`);
      load();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  // Isu #56: suspend/unsuspend langsung dari daftar — anggota bermasalah
  // (berdenda/terlambat) langsung tidak lolos gate checkout pinjam/reservasi.
  // Pengganti window.confirm: dialog konfirmasi suspend via ConfirmModal.
  const [pendingStatus, setPendingStatus] = useState<{
    id: string;
    code: string;
    next: 'active' | 'suspended';
  } | null>(null);

  function onSetStatus(id: string, code: string, next: 'active' | 'suspended') {
    setPendingStatus({ id, code, next });
  }

  async function confirmSetStatus() {
    const p = pendingStatus;
    if (!p) return;
    setPendingStatus(null);
    setActionError('');
    const res = await fetch(`/api/members/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: p.next }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(errMsg(json));
      return;
    }
    load();
  }

  async function confirmBulkDelete() {
    setPendingBulkDelete(false);
    setActionError('');
    setLoadError('');
    setNotice('');
    setBulkLoading(true);
    try {
      const ids = [...selected];
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/members/${id}`, { method: 'DELETE' }))
      );
      let deleted = 0;
      let skipped = 0;
      const failed: string[] = [];
      const failureMsgs: string[] = [];
      for (const [i, r] of results.entries()) {
        const id = ids[i];
        if (r.status === 'rejected') {
          if (id) failed.push(id);
          failureMsgs.push((r.reason as Error)?.message || 'Gagal menghapus anggota.');
          continue;
        }
        const res = r.value;
        if (res.ok) {
          deleted++;
        } else if (res.status === 409) {
          skipped++;
        } else {
          if (id) failed.push(id);
          const json = (await res.json().catch(() => ({}))) as unknown;
          failureMsgs.push(errMsg(json, 'Gagal menghapus anggota.'));
        }
      }
      const failureMsg = [...new Set(failureMsgs)].join('; ');
      if (failed.length > 0 || skipped > 0) {
        const parts = [`${deleted} dihapus`];
        if (skipped > 0) parts.push(`${skipped} dilewati (masih punya pinjaman berjalan)`);
        if (failed.length > 0) parts.push(`${failed.length} gagal`);
        const idLine =
          failed.length > 0
            ? ` ID gagal: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? ', …' : ''}`
            : '';
        setActionError(parts.join(', ') + (failureMsg ? `. ${failureMsg}` : '') + idLine);
      } else {
        setActionError('');
        setNotice(`${deleted} anggota dihapus.`);
      }
      setSelected(failed.length > 0 ? new Set(failed) : new Set());
      load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-bold">Anggota</h1>
        <p className="text-sm text-slate-500">
          members.user_id wajib merujuk profiles.id (auth user). Nama tampil dari
          profiles.full_name.
        </p>
      </div>
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-red-600">
          {loadError}
        </p>
      )}
      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}
      <form onSubmit={onAdd} className="grid gap-2 rounded-2xl border bg-white p-4">
        <div className="grid gap-1">
          <label
            htmlFor="anggota-profile-search"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Cari profil anggota
          </label>
          <input
            id="anggota-profile-search"
            role="combobox"
            aria-expanded={pickOpen}
            aria-controls={pickerListId}
            aria-autocomplete="list"
            className="h-11 min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-4 text-sm text-slate-900 transition hover:border-slate-300 focus:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
            placeholder="Ketik nama / kode anggota…"
            value={pickText}
            onChange={(e) => {
              setPickText(e.target.value);
              runPicker(e.target.value);
            }}
            onBlur={() => setTimeout(() => setPickOpen(false), 120)}
          />
          {pickOpen && pickOptions.length > 0 && (
            <ul
              role="listbox"
              id={pickerListId}
              aria-label="Hasil pencarian profil"
              className="grid max-h-56 gap-1 overflow-auto rounded-lg border bg-white p-1"
            >
              {pickOptions.map((o) => (
                <li
                  key={o.user_id}
                  role="option"
                  aria-selected={form.user_id === o.user_id}
                  className="cursor-pointer rounded px-3 py-2 text-sm hover:bg-slate-100"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setForm({ ...form, user_id: o.user_id });
                    setPickText(`${o.label} (${o.sub})`);
                    setPickOpen(false);
                  }}
                >
                  {o.label} ({o.sub})
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Input
              id="anggota-user-id"
              label="User ID (UUID profiles)"
              placeholder="user_id terisi otomatis dari pencarian*"
              value={form.user_id}
              onChange={(e) => setForm({ ...form, user_id: e.target.value })}
              required
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <Input
              id="anggota-member-code"
              label="Kode anggota"
              hint="Otomatis bila kosong"
              placeholder="member_code (auto bila kosong)"
              value={form.member_code}
              onChange={(e) => setForm({ ...form, member_code: e.target.value })}
            />
          </div>
          <div className="min-w-[160px] flex-1">
            <Input
              id="anggota-phone"
              label="Telepon"
              placeholder="Telepon"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <Input
              id="anggota-address"
              label="Alamat"
              placeholder="Alamat"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <Button type="submit" loading={loading}>
            + Tambah
          </Button>
        </div>
        {formError && (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}
      </form>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Input
            id="anggota-search"
            label="Cari anggota"
            placeholder="Cari kode / nama / telepon…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
        {selected.size > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={toggleAllMembers}>
              {selected.size === rows.length ? 'Batalkan semua' : 'Pilih semua'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={bulkLoading}
              onClick={() => setPendingBulkDelete(true)}
            >
              {`Hapus terpilih (${selected.size})`}
            </Button>
          </>
        )}
      </div>
      <DataTable<Member>
        caption={`Daftar anggota halaman ${page} dari ${totalPages}`}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
        selectedKeys={selected}
        onToggleRow={toggleSelect}
        onToggleAll={toggleAllMembers}
        bulkLabel={(k) => `Pilih anggota ${k}`}
        columns={[
          {
            key: 'member_code',
            header: 'Kode',
            sortable: true,
            render: (r) => <span className="font-medium">{r.member_code}</span>,
          },
          {
            key: 'profiles',
            header: 'Nama',
            sortable: true,
            render: (r) => r.profiles?.full_name ?? '-',
          },
          { key: 'phone', header: 'Telepon' },
          {
            key: 'status',
            header: 'Status',
            sortable: true,
            render: (r) => <StatusBadge status={r.status} />,
          },
          {
            key: 'fines_total',
            header: 'Tagihan',
            render: (r) => {
              const v = Number(r.fines_total ?? 0);
              if (v <= 0) return <span className="text-slate-400">-</span>;
              return (
                <span
                  aria-label={`Tagihan ${fmtRp(v)}`}
                  className="inline-flex min-h-[24px] items-center rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800"
                >
                  {fmtRp(v)}
                </span>
              );
            },
          },
          {
            key: 'active_loans',
            header: 'Pinjam aktif',
            render: (r) => Number(r.active_loans ?? 0),
          },
          {
            key: 'overdue_loans',
            header: 'Telat',
            render: (r) => {
              const v = Number(r.overdue_loans ?? 0);
              if (v <= 0) return <span className="text-slate-400">-</span>;
              return (
                <span
                  aria-label={`${v} peminjaman terlambat`}
                  className="inline-flex min-h-[24px] items-center rounded-full bg-red-100 px-2 text-xs font-semibold text-red-700"
                >
                  {v}
                </span>
              );
            },
          },
          {
            key: 'aksi',
            header: 'Aksi',
            render: (r) => (
              <div className="flex flex-wrap items-center gap-2">
                {r.status === 'active' ? (
                  <button
                    type="button"
                    onClick={() => onSetStatus(r.id, r.member_code, 'suspended')}
                    aria-label={`Suspend anggota ${r.member_code}`}
                    className="inline-flex min-h-[44px] items-center text-amber-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Suspend
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetStatus(r.id, r.member_code, 'active')}
                    aria-label={`Aktifkan anggota ${r.member_code}`}
                    className="inline-flex min-h-[44px] items-center text-green-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Aktifkan
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPendingDelete(r)}
                  aria-label={`Hapus anggota ${r.member_code}`}
                  className="inline-flex min-h-[44px] items-center text-red-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Hapus
                </button>
              </div>
            ),
          },
        ]}
        rows={rows}
        getRowKey={(r) => r.id}
        emptyState={{
          title: 'Belum ada anggota',
          description: search
            ? `Tidak ada anggota yang cocok dengan "${search}". Coba kode atau nama lain.`
            : 'Anggota terdaftar akan muncul di sini.',
        }}
      />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
        title="Hapus anggota"
        description="Anggota yang masih punya pinjaman berjalan tidak bisa dihapus."
        confirmLabel="Ya, hapus"
      >
        <p>
          Hapus anggota <strong>{pendingDelete?.member_code}</strong>?
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={pendingBulkDelete}
        onClose={() => setPendingBulkDelete(false)}
        onConfirm={() => void confirmBulkDelete()}
        title={`Hapus ${selected.size} anggota terpilih`}
        description="Anggota yang masih punya pinjaman berjalan akan dilewati otomatis."
        confirmLabel="Ya, hapus semua"
        loading={bulkLoading}
      >
        <p>Hapus {selected.size} anggota terpilih?</p>
      </ConfirmModal>

      <ConfirmModal
        open={pendingStatus !== null}
        onClose={() => setPendingStatus(null)}
        onConfirm={() => void confirmSetStatus()}
        title={pendingStatus?.next === 'suspended' ? 'Suspend anggota' : 'Aktifkan anggota'}
        description={
          pendingStatus?.next === 'suspended'
            ? 'Pinjam/reservasi anggota akan ditolak gate kelayakan.'
            : undefined
        }
        confirmLabel={pendingStatus?.next === 'suspended' ? 'Ya, suspend' : 'Ya, aktifkan'}
      >
        <p>
          {pendingStatus?.next === 'suspended' ? 'Suspend' : 'Aktifkan'} anggota{' '}
          <strong>{pendingStatus?.code}</strong>?
        </p>
      </ConfirmModal>
    </div>
  );
}
