/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Cloudflare Workers has no Next Image Optimization: `unoptimized: true`
    // global prevents 500s when a next/image omits the per-prop `unoptimized`.
    // Per-component `unoptimized` props are kept as belt-and-braces.
    // remotePatterns is restricted to Supabase Storage hosts only (no `**`
    // wildcard): covers/banners/logos/articles all live in `library-assets`.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'http',
        hostname: '*.supabase.co',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    optimizePackageImports: ['lucide-react'],
  },
  // Cap webpack infra logging at errors: Next 14 serializes large
  // framework modules (react-dom server bundles, ~100-250kiB) into its
  // build cache, and webpack logs a perf hint per build. Nothing in src/
  // triggers it (no source file >50kiB) and the output is unaffected —
  // this only keeps deploy logs signal-only. Real bundling problems
  // still surface via typecheck/eslint/tests/CI.
  webpack: (config) => {
    config.infrastructureLogging = { level: 'error' };
    return config;
  },
};

export default nextConfig;
