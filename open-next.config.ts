import { defineCloudflareConfig } from '@opennextjs/cloudflare';

const cloudflareConfig = {
  ...defineCloudflareConfig(),
  buildCommand: 'npm run next:build',
};

export default cloudflareConfig;
