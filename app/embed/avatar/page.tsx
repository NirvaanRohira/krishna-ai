import type { Metadata } from 'next'
import AvatarEmbed from '@/components/AvatarEmbed'
import { DEFAULT_OUTFIT_ID, OUTFITS } from '@/lib/avatar/config'

// The avatar alone, for the mobile apps' voice mode (docs/MOBILE_PLAN.md). The app shows this
// page in a WebView and sends it Kanha's voice, one sentence at a time; the page plays it and
// moves the avatar's mouth to it, with the same painted and 3D players as the website.
// Public and personal-data free: it never sees a token, a message or who is signed in.
export const metadata: Metadata = { title: 'Kanha', robots: { index: false, follow: false } }

export default async function AvatarEmbedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams
  const asked = typeof q.outfit === 'string' ? q.outfit : ''
  const outfit = OUTFITS.some((o) => o.id === asked) ? asked : DEFAULT_OUTFIT_ID
  return <AvatarEmbed initialOutfit={outfit} />
}
