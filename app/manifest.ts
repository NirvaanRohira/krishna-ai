import type { MetadataRoute } from 'next'

// Installable app ("Add to Home Screen"): opens full screen on the chat, with Kanha's icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Kanha: reflect with the Bhagavad Gita',
    short_name: 'Kanha',
    description: 'An AI guide to the Gita and the scriptures, shown in Krishna’s likeness. Not God, not Krishna.',
    start_url: '/chat',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fbf6ec',
    theme_color: '#141634',
    lang: 'en-IN',
    categories: ['lifestyle', 'books', 'education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: "Today's verse", url: '/verse', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Past conversations', url: '/history', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
