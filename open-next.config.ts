import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Opennext memanggil `npm run build` secara default, jadi scripts.build
// TIDAK BOLEH memanggil opennext (rekursi tanpa akhir). buildCommand
// dialihkan ke script non-rekursif. Lihat:
// https://opennext.js.org/cloudflare/cli#build-command
const cloudflareConfig = {
  ...defineCloudflareConfig(),
  buildCommand: 'npm run next:build',
};

export default cloudflareConfig;
