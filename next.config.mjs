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
  // Security headers: CSP, HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options
  // CSP keeps unsafe-inline (Next.js runtime requires it); eval dropped.
  // TODO(Next 15): Replace 'unsafe-inline' with nonce-based CSP via middleware injection
  // when migrating to Next.js 15 (middleware can inject nonces into HTML responses).
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    return [
      {
        source: '/:path*',
        headers: [
          // CSP: restrict scripts/styles/fonts to self + Supabase CDN + inline for dev
          {
            key: 'Content-Security-Policy',
            value: isProd
              ? [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-inline' https://*.supabase.co",
                  "style-src 'self' 'unsafe-inline' https://*.supabase.co",
                  "img-src 'self' data: https: blob:",
                  "font-src 'self' data: https://*.supabase.co",
                  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
                  "object-src 'none'",
                  "frame-ancestors 'none'",
                  "base-uri 'self'",
                  "form-action 'self'",
                  'upgrade-insecure-requests',
                ].join('; ')
              : "default-src 'self' 'unsafe-inline' https: data: blob:; frame-ancestors 'none' object-src 'none'; upgrade-insecure-requests",
          },
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
