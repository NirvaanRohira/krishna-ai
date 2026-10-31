/** @type {import('next').NextConfig} */
const nextConfig = {
  // `BUILD_STANDALONE=1 next build` emits a self-contained server (.next/standalone) for
  // the Docker image (Cloud Run / App Runner — see docs/COST_AND_AVATAR_PLAN.md).
  // Vercel builds leave this unset and are unaffected.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
  async headers() {
    return [
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
