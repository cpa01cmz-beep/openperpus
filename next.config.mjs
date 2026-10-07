/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Responsive images via Supabase Storage transforms (custom loader).
    // Cloudflare Workers has no Next Image Optimization server, so a
    // custom loader rewrites Supabase public URLs to the render/image
    // transform API with the requested width (?width=&quality=75). This
    // restores srcset on mobile instead of downloading full-size originals.
    // Non-Supabase URLs (e.g. /og-default.jpg) pass through untouched.
    loader: 'custom',
    loaderFile: './src/lib/imageLoader.ts',
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
  // ponytail: blok webpack (cap infra logging) dibuang — Next 16 default Turbopack
  // dan menolak config webpack. Upgrade path: `infrastructureLogging` via turbopack config bila perlu.
  // Security headers: HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options.
  // CSP lives ONLY in src/middleware.ts (nonce-based, per-request): keeping a
  // second static CSP here would emit a duplicate Content-Security-Policy
  // header per response. See buildContentSecurityPolicy() in the middleware.
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    return [
      {
        source: '/:path*',
        headers: [
          // HSTS: enforce HTTPS for 1 year (prod only)
          ...(isProd
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains; preload',
                },
              ]
            : []),
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/og-default.jpg',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, immutable' }],
      },
    ];
  },
};

export default nextConfig;
