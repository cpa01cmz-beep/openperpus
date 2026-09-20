'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import DataTable, { type SortDir } from '@/components/admin/DataTable';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Pagination from '@/components/ui/Pagination';
import { sanitizeIlike } from '@/lib/search';

type Member = {
  id: string;
  user_id: string;
  member_code: string;
  phone: string | null;
  address: string | null;
  status: string;
  profiles?: { full_name: string | null } | null;
};

type PickOption = { user_id: string; label: string; sub: string };

function errMsg(json: unknown): string {
  const err = (json as { error?: { message?: string } | string } | null | undefined)?.error;
  if (!err) return 'Gagal.';
  return typeof err === 'string' ? err : (err.message ?? 'Gagal.');
}

export default function AnggotaPage() {
  const [rows, setRows] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ user_id: '', member_code: '', phone: '', address: '' });
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  // Profile picker (search-as-you-type) — mengisi user_id tanpa paste UUID manual.
  const [pickText, setPickText] = useState('');
  const [pickOptions, setPickOptions] = useState<PickOption[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerListId = useId();

  const load = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), per_page: '10', q: search });
    const res = await fetch(`/api/members?${q}`);
    const json = (await res.json()) as {
      data?: Member[];
      pagination?: { totalPages?: number };
      meta?: { totalPages?: number };
    };
    if (res.ok) {
      setRows(json.data ?? []);
      setTotalPages(json.pagination?.totalPages ?? json.meta?.totalPages ?? 1);
    }
  }, [search, page]);

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
        const json = (await res.json()) as { data?: Member[] };
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

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const val = (m: Member): string => {
      if (sortKey === 'profiles') return m.profiles?.full_name ?? '';
      return String((m as unknown as Record<string, unknown>)[sortKey] ?? '');
    };
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => val(a).localeCompare(val(b)) * dir);
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: string) {
    setSortDir((prev) => (sortKey === key && prev === 'asc' ? 'desc' : 'asc'));
    setSortKey(key);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.user_id.trim())
      return alert('Pilih profil anggota lewat pencarian atau isi user_id.');
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
      const json = await res.json();
      if (!res.ok) throw new Error(errMsg(json));
      setForm({ user_id: '', member_code: '', phone: '', address: '' });
      setPickText('');
      setPickOptions([]);
      load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string, code: string) {
    if (!confirm('Hapus anggota ini?')) return;
    setActionError('');
    const res = await fetch(`/api/members?id=${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      // Cerminan buku: tolak dengan penjelasan bila masih ada pinjaman berjalan.
      if (res.status === 409) {
        setActionError(
          `Anggota ${code} tidak bisa dihapus: masih punya pinjaman berjalan. Kembalikan dulu semua pinjamannya.`
        );
        return;
      }
      return alert(errMsg(json));
    }
    load();
  }

  async function onBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Hapus ${selected.size} anggota terpilih?`)) return;
    setActionError('');
    setBulkLoading(true);
    try {
      const ids = [...selected];
      const deleted: string[] = [];
      const skipped: string[] = [];
      for (const id of ids) {
        const res = await fetch(`/api/members?id=${id}`, { method: 'DELETE' });
        if (res.ok) deleted.push(id);
        else if (res.status === 409) skipped.push(id);
        else {
          const json = (await res.json().catch(() => ({}))) as unknown;
          return alert(errMsg(json));
        }
      }
      if (skipped.length > 0)
        setActionError(
          `${deleted.length} dihapus, ${skipped.length} dilewati (masih punya pinjaman berjalan).`
        );
      setSelected(new Set());
      load();
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
      </form>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm">
          <Input
            id="anggota-search"
            label="Cari anggota"
            placeholder="Cari kode / telepon…"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
        {selected.size > 0 && (
          <Button variant="danger" size="sm" loading={bulkLoading} onClick={onBulkDelete}>
            {`Hapus terpilih (${selected.size})`}
          </Button>
        )}
      </div>
      {actionError && (
        <p role="alert" className="text-sm text-red-600">
          {actionError}
        </p>
      )}
      <DataTable<Member>
        caption={`Daftar anggota halaman ${page} dari ${totalPages}`}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={toggleSort}
        selectedKeys={selected}
        onToggleRow={toggleSelect}
        onToggleAll={toggleAll}
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
          { key: 'status', header: 'Status', sortable: true },
          {
            key: 'aksi',
            header: 'Aksi',
            render: (r) => (
              <button
                type="button"
                onClick={() => onDelete(r.id, r.member_code)}
                aria-label={`Hapus anggota ${r.member_code}`}
                className="inline-flex min-h-[44px] items-center text-red-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Hapus
              </button>
            ),
          },
        ]}
        rows={sorted}
        getRowKey={(r) => r.id}
      />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
