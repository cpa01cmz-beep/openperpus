# AGENTS.md

## Aturan kerja (wajib)

- **Jangan menjalankan test suite lokal** (vitest, playwright, e2e). Gate kualitas = GitHub Actions `.github/workflows/ci.yml` di PR (typecheck, lint, unit+components, playwright-list).
- Verifikasi lokal cukup `npm run check` (typecheck + lint). Setelah push, pantau test lewat `gh pr checks <nomor-PR> --watch`; perbaiki merah dengan push baru, jangan test ulang di lokal.
- Jangan `npm install` di worktree yang node_modules-nya di-symlink dari repo utama.
- Jangan commit secret / `.env.local`.
- Satu PR satu tujuan; draft PR sampai checks hijau + review approve.
