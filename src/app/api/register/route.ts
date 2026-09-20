import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { jsonError } from '@/lib/http-error';

/**
 * POST /api/register — publik (tanpa requireStaff).
 * Body: { nama|full_name, email, password, phone?, address?, member_code? }
 * Sukses -> 201 { data: members row status 'pending' }.
 *
 * ponytail: RLS self-insert (profiles/members) belum dibuka — saat ini insert
 * mengandalkan service_role/anon sesuai server client; upgrade path: tambah
 * policy self-insert + batasi status='pending' di migrasi berikutnya.
 */

function pickString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError('VALIDATION', 'Body JSON tidak valid.', 422);
  }

  const nama = (
    pickString(body.nama) ||
    pickString(body.full_name) ||
    pickString(body.name)
  ).trim();
  const email = pickString(body.email).trim().toLowerCase();
  const password = pickString(body.password);
  const phoneRaw = (body.phone ?? body.telepon ?? null) as string | null;
  const addressRaw = (body.address ?? body.alamat ?? null) as string | null;
  let memberCode = pickString(body.member_code ?? body.memberCode ?? body.no_anggota).trim();

  if (!nama) return jsonError('VALIDATION', 'nama wajib diisi.', 422);
  if (!/.+@.+\..+/.test(email)) return jsonError('VALIDATION', 'email tidak valid.', 422);
  if (password.length < 6) return jsonError('VALIDATION', 'password minimal 6 karakter.', 422);
  if (phoneRaw !== null && phoneRaw !== undefined && phoneRaw !== '') {
    if (typeof phoneRaw !== 'string') return jsonError('VALIDATION', 'phone harus string.', 422);
    if (phoneRaw.length > 30) return jsonError('VALIDATION', 'phone maksimal 30 karakter.', 422);
  }
  if (addressRaw !== null && addressRaw !== undefined && addressRaw !== '') {
    if (typeof addressRaw !== 'string')
      return jsonError('VALIDATION', 'address harus string.', 422);
    if (addressRaw.length > 500)
      return jsonError('VALIDATION', 'address maksimal 500 karakter.', 422);
  }

  const phone = phoneRaw && String(phoneRaw).trim() ? String(phoneRaw).trim() : null;
  const address = addressRaw && String(addressRaw).trim() ? String(addressRaw).trim() : null;

  const supabase = createClient();

  const { data: dupProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .single();
  if (dupProfile) return jsonError('CONFLICT', 'email sudah terdaftar.', 409);

  if (memberCode) {
    const { data: dupMember } = await supabase
      .from('members')
      .select('id')
      .eq('member_code', memberCode)
      .single();
    if (dupMember) return jsonError('CONFLICT', 'member_code sudah dipakai.', 409);
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });
  const user = signUpData?.user;
  if (signUpError || !user) {
    const msg = (signUpError as { message?: string } | null)?.message ?? '';
    if (/already|exists|duplicate|terdaftar/i.test(msg))
      return jsonError('CONFLICT', 'email sudah terdaftar.', 409);
    return jsonError('SAVE_FAILED', 'Gagal mendaftar.', 500);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: user.id, email, full_name: nama, role: 'member' })
    .single();
  if (profileError) {
    if ((profileError as { code?: string }).code === '23505')
      return jsonError('CONFLICT', 'email sudah terdaftar.', 409);
    return jsonError('SAVE_FAILED', 'Gagal mendaftar.', 500);
  }

  if (!memberCode) {
    const d = new Date();
    memberCode = `AG-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
  }

  const { data: member, error: memberError } = await supabase
    .from('members')
    .insert({ user_id: user.id, member_code: memberCode, phone, address, status: 'pending' })
    .select()
    .single();
  if (memberError) {
    if ((memberError as { code?: string }).code === '23505')
      return jsonError('CONFLICT', 'member_code/user_id sudah dipakai.', 409);
    return jsonError('SAVE_FAILED', 'Gagal mendaftar.', 500);
  }

  try {
    await supabase
      .from('activity_logs')
      .insert({ action: 'members.register', user_id: user.id, metadata: { email } });
  } catch {
    // best-effort: jangan gagalkan request
  }

  return NextResponse.json({ data: member }, { status: 201 });
}
