// Avatar asset configuration.
//
// Two renderers: the painted avatar (/public/avatar/painted/*.mavatar, mesh-avatar runtime,
// the default) and the 3D GLB below. See docs/AVATAR_PIPELINE.md.
//
// The 3D model is a single GLB in /public/avatar (or a CDN URL via
// NEXT_PUBLIC_AVATAR_MODEL_URL). Each outfit is a top-level node in that GLB named
// `outfit_<id>` (e.g. `outfit_royal`), all skinned to the same skeleton; the viewer
// shows one and hides the rest. See docs/AVATAR_PIPELINE.md for the Blender export spec.
//
// Until the GLB exists, the viewer falls back to the 2D poster with an audio-reactive
// aura, so the feature works today and upgrades automatically when the model is dropped in.

export type Outfit = {
  id: string
  label: string
  /** Accent colour for the picker chip (used when no thumbnail is provided). */
  swatch: string
  /** Optional 2D preview, e.g. /avatar/outfits/royal.webp */
  thumbnail?: string
  /** Optional per-outfit poster used in 2D fallback mode. */
  poster?: string
  /** The outfit's own model file. Each look is a separate GLB, used on both themes. */
  model?: string
  /** The painted 2D-mesh version of this look (a .mavatar archive, played by `mesh-avatar`). */
  painted?: string
}

/**
 * How the avatar is drawn. "painted" is a single illustration that breathes, blinks and talks
 * (mesh-avatar); "3d" is the Blender GLB. Painted is the default; 3D stays as the alternative
 * and as the fallback when the painted player can't start.
 */
export type AvatarStyle = 'painted' | '3d'
export const AVATAR_STYLES: AvatarStyle[] = ['painted', '3d']
export const DEFAULT_AVATAR_STYLE: AvatarStyle = 'painted'
const STYLE_KEY = 'krishna.avatarStyle'

export function loadSavedStyle(): AvatarStyle {
  try {
    const v = window.localStorage.getItem(STYLE_KEY)
    if (v === 'painted' || v === '3d') return v
  } catch { /* storage blocked */ }
  return DEFAULT_AVATAR_STYLE
}

export function saveStyle(style: AvatarStyle): void {
  try { window.localStorage.setItem(STYLE_KEY, style) } catch { /* storage blocked */ }
}

/** The painted file for an outfit, or null when that look has no painted version. */
export function paintedAvatarUrl(outfitId: string): string | null {
  return OUTFITS.find((o) => o.id === outfitId)?.painted ?? null
}

/**
 * Which renderer actually draws this outfit: the chosen style when the outfit has it,
 * otherwise whichever the outfit does have.
 */
export function rendererFor(outfitId: string, style: AvatarStyle): AvatarStyle {
  const o = OUTFITS.find((x) => x.id === outfitId)
  if (style === 'painted' && o?.painted) return 'painted'
  if (style === '3d' && (o?.model || process.env.NEXT_PUBLIC_AVATAR_MODEL_URL)) return '3d'
  return o?.painted ? 'painted' : '3d'
}

/**
 * The model file for an outfit. Each look is its own GLB (no painted glow, so one file serves
 * both themes). NEXT_PUBLIC_AVATAR_MODEL_URL overrides everything with a single file whose
 * outfits are `outfit_*` nodes.
 */
export function avatarModelUrl(outfitId: string): string {
  if (process.env.NEXT_PUBLIC_AVATAR_MODEL_URL) return process.env.NEXT_PUBLIC_AVATAR_MODEL_URL
  const o = OUTFITS.find((x) => x.id === outfitId) ?? OUTFITS.find((x) => x.id === BASE_MODEL_OUTFIT_ID)
  return o?.model ?? '/avatar/krishna-divine.glb'
}

/** Outfits that have their own model file (the picker enables these). */
export function outfitsWithModels(): string[] {
  return OUTFITS.filter((o) => o.model).map((o) => o.id)
}
export const AVATAR_POSTER_URL = '/avatar/poster-divine-v2.webp'
export const OUTFIT_NODE_PREFIX = 'outfit_'

export const OUTFITS: Outfit[] = [
  // Royal opens avatar mode (painted); the sheet offers the others, which shows people there's a choice.
  { id: 'royal', label: 'Royal', swatch: 'linear-gradient(135deg,#1d2a6b,#c9a24a)', thumbnail: '/avatar/outfits/royal.webp', model: '/avatar/krishna-royal.glb', painted: '/avatar/painted/royal.mavatar' },
  // Divine stays the Blender model only: its painted version didn't read as divine. It's still
  // the face of the app (landing page, poster).
  { id: 'divine', label: 'Divine', swatch: 'linear-gradient(135deg,#f6c9ff,#9fd8ff 55%,#f4c26b)', poster: AVATAR_POSTER_URL, thumbnail: '/avatar/outfits/divine.webp', model: '/avatar/krishna-divine.glb' },
  { id: 'pastoral', label: 'Pastoral', swatch: 'linear-gradient(135deg,#c9b98a,#e2a35b)', thumbnail: '/avatar/outfits/pastoral.webp', model: '/avatar/krishna-pastoral.glb', painted: '/avatar/painted/pastoral.mavatar' },
  // Fusion (contemporary kurta) is out of the alpha: it didn't land with testers.
]

/** The outfit avatar mode opens on. */
export const DEFAULT_OUTFIT_ID = 'royal'
/** The look of a model file that has no `outfit_*` nodes, and the fallback model. */
export const BASE_MODEL_OUTFIT_ID = 'divine'
const STORAGE_KEY = 'krishna.outfit'

export function loadSavedOutfit(): string {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v && OUTFITS.some((o) => o.id === v)) return v
  } catch { /* storage blocked */ }
  return DEFAULT_OUTFIT_ID
}

export function saveOutfit(id: string): void {
  try { window.localStorage.setItem(STORAGE_KEY, id) } catch { /* storage blocked */ }
}

/**
 * Given node names found in the GLB, which configured outfits are actually present. A model
 * with no outfit nodes at all is one look, the default (Divine).
 */
export function outfitsPresentInModel(nodeNames: string[]): string[] {
  if (!nodeNames.some((n) => n.startsWith(OUTFIT_NODE_PREFIX))) return [BASE_MODEL_OUTFIT_ID]
  const set = new Set(nodeNames)
  return OUTFITS.filter((o) => set.has(OUTFIT_NODE_PREFIX + o.id)).map((o) => o.id)
}
