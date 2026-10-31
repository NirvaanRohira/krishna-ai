const supabaseOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin } catch { return '' }
})()

// Content-Security-Policy. Shipped as Report-Only first: watch the browser console /
// report endpoint on staging, then rename the header to `Content-Security-Policy` to enforce.
// 'unsafe-inline' for scripts is required by Next 14 without per-request nonces;
// 'wasm-unsafe-eval' is for the avatar's mesh decoder.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace('https://', 'wss://')}`.trim(),
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Microphone for voice input only; no camera, location, or payment APIs from the page.
  { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Content-Security-Policy-Report-Only', value: csp },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // `BUILD_STANDALONE=1 next build` emits a self-contained server (.next/standalone) for
  // the Docker image (Cloud Run / App Runner — see docs/COST_AND_AVATAR_PLAN.md).
  // Vercel builds leave this unset and are unaffected.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        // The avatar GLB and textures are versioned by filename; let browsers and the CDN
        // keep them so the model downloads once per device, not once per visit.
        source: '/avatar/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }],
      },
    ]
  },
};

export default nextConfig;
