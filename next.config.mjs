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
};

export default nextConfig;
