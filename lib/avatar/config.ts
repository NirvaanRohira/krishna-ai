// Avatar asset configuration.
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
}

/**
 * The model file for an outfit. Each look is its own GLB (no painted glow, so one file serves
 * both themes). NEXT_PUBLIC_AVATAR_MODEL_URL overrides everything with a single file whose
 * outfits are `outfit_*` nodes.
 */
export function avatarModelUrl(outfitId: string): string {
  if (process.env.NEXT_PUBLIC_AVATAR_MODEL_URL) return process.env.NEXT_PUBLIC_AVATAR_MODEL_URL
  const o = OUTFITS.find((x) => x.id === outfitId) ?? OUTFITS.find((x) => x.id === DEFAULT_OUTFIT_ID)
  return o?.model ?? '/avatar/krishna-divine.glb'
}

/** Outfits that have their own model file (the picker enables these). */
export function outfitsWithModels(): string[] {
  return OUTFITS.filter((o) => o.model).map((o) => o.id)
}
export const AVATAR_POSTER_URL = '/avatar/poster-divine-v2.webp'
export const OUTFIT_NODE_PREFIX = 'outfit_'

export const OUTFITS: Outfit[] = [
  { id: 'divine', label: 'Divine', swatch: 'linear-gradient(135deg,#f6c9ff,#9fd8ff 55%,#f4c26b)', poster: AVATAR_POSTER_URL, model: '/avatar/krishna-divine.glb' },
  { id: 'royal', label: 'Royal', swatch: 'linear-gradient(135deg,#1d2a6b,#c9a24a)', model: '/avatar/krishna-royal.glb' },
  { id: 'pastoral', label: 'Pastoral', swatch: 'linear-gradient(135deg,#c9b98a,#e2a35b)', model: '/avatar/krishna-pastoral.glb' },
  // Fusion (contemporary kurta) is out of the alpha: it didn't land with testers.
]

export const DEFAULT_OUTFIT_ID = 'divine'
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
  if (!nodeNames.some((n) => n.startsWith(OUTFIT_NODE_PREFIX))) return [DEFAULT_OUTFIT_ID]
  const set = new Set(nodeNames)
  return OUTFITS.filter((o) => set.has(OUTFIT_NODE_PREFIX + o.id)).map((o) => o.id)
}
