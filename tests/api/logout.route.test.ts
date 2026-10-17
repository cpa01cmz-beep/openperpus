import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Logout (review audit keamanan): satu-satunya cara mengakhiri sesi Supabase
 * dari aplikasi. Regression test struktural — bukti kontrak:
 * 1. Route handler POST memanggil supabase.auth.signOut() dan redirect 303 /login;
 * 2. Sidebar menyediakan aksi logout sebagai form POST (bukan Link GET),
 *    agar tunduk pada gate CSRF same-origin middleware.
 */
const routeSrc = readFileSync(join(process.cwd(), 'src/app/api/auth/logout/route.ts'), 'utf8');
const sidebarSrc = readFileSync(join(process.cwd(), 'src/components/admin/Sidebar.tsx'), 'utf8');

describe('logout route', () => {
  it('POST handler memanggil auth.signOut dan redirect ke /login', async () => {
    expect(routeSrc).toContain('signOut()');
    // Redirect 303 (See Other) menuju /login
    expect(routeSrc).toMatch(/status: 303/);
    // Wajib method POST — jangan dieksekusi via GET navigasi biasa
    expect(routeSrc).toMatch(/export async function POST/);
  });

  it('Sidebar menyediakan tombol Keluar sebagai form POST ke route logout', () => {
    expect(sidebarSrc).toMatch(/method="post"/i);
    expect(sidebarSrc).toContain('/api/auth/logout');
    expect(sidebarSrc).toContain('Keluar');
  });
});
