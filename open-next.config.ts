import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Opennext memanggil `npm run build` secara default, jadi scripts.build
// TIDAK BOLEH memanggil opennext (rekursi tanpa akhir). buildCommand
// dialihkan ke script non-rekursif. Lihat:
// https://opennext.js.org/cloudflare/cli#build-command
export default {
  ...defineCloudflareConfig(),
  buildCommand: 'npm run next:build',
};
