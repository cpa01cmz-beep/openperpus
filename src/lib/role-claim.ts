/**
 * Header klaim role yang di-set middleware untuk /admin (issue #53).
 * Nilai sah HANYA datang dari middleware (setelah query profiles.role;
 * header klien di-overwrite/di-strip di src/middleware.ts). Server component
 * (admin/layout.tsx) membaca via headers() tanpa query profiles kedua.
 */
export const ROLE_HEADER = 'x-role';
