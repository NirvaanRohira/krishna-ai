import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { unpackAvatar, validateAvatarFiles } from 'mesh-avatar'
import {
  OUTFITS, loadSavedOutfit, saveOutfit, outfitsPresentInModel, DEFAULT_OUTFIT_ID, avatarModelUrl, outfitsWithModels,
  loadSavedStyle, saveStyle, paintedAvatarUrl, rendererFor, DEFAULT_AVATAR_STYLE,
} from '@/lib/avatar/config'

describe('avatar config', () => {
  beforeEach(() => window.localStorage.clear())

  it('ships the alpha outfits (Fusion is out of the alpha)', () => {
    expect(OUTFITS.map((o) => o.id)).toEqual(['divine', 'royal', 'pastoral'])
  })

  it('remembers the chosen outfit and ignores unknown ids', () => {
    expect(loadSavedOutfit()).toBe(DEFAULT_OUTFIT_ID)
    saveOutfit('royal')
    expect(loadSavedOutfit()).toBe('royal')
    window.localStorage.setItem('krishna.outfit', 'nonexistent')
    expect(loadSavedOutfit()).toBe(DEFAULT_OUTFIT_ID)
  })

  it('detects which outfits a GLB actually contains from its node names', () => {
    expect(outfitsPresentInModel(['Armature', 'outfit_divine', 'outfit_royal', 'Body'])).toEqual(['divine', 'royal'])
  })

  it('a model with no outfit nodes is one look: the default (Divine)', () => {
    expect(outfitsPresentInModel(['Krishna_Rig', 'Krishna', 'root', 'chest', 'head'])).toEqual([DEFAULT_OUTFIT_ID])
  })

  it('each outfit has its own model file, used on both themes', () => {
    expect(avatarModelUrl('divine')).toBe('/avatar/krishna-divine.glb')
    expect(avatarModelUrl('royal')).toBe('/avatar/krishna-royal.glb')
    expect(avatarModelUrl('pastoral')).toBe('/avatar/krishna-pastoral.glb')
    expect(avatarModelUrl('fusion')).toBe('/avatar/krishna-divine.glb') // unknown → the default look
    expect(outfitsWithModels()).toEqual(['divine', 'royal', 'pastoral'])
  })

  it('painted is the default style, remembered, and unknown values are ignored', () => {
    expect(DEFAULT_AVATAR_STYLE).toBe('painted')
    expect(loadSavedStyle()).toBe('painted')
    saveStyle('3d')
    expect(loadSavedStyle()).toBe('3d')
    window.localStorage.setItem('krishna.avatarStyle', 'video')
    expect(loadSavedStyle()).toBe('painted')
  })

  it('draws each outfit with the chosen style, and falls back to what the outfit has', () => {
    expect(rendererFor('royal', 'painted')).toBe('painted')
    expect(rendererFor('royal', '3d')).toBe('3d')
    expect(paintedAvatarUrl('pastoral')).toBe('/avatar/painted/pastoral.mavatar')
    expect(paintedAvatarUrl('fusion')).toBeNull()
    expect(rendererFor('fusion', 'painted')).toBe('3d')
  })

  it('every outfit has a thumbnail, a painted file and a model on disk', () => {
    for (const o of OUTFITS) {
      for (const f of [o.thumbnail, o.painted, o.model]) {
        expect(f, `${o.id}`).toBeTruthy()
        expect(existsSync(join(process.cwd(), 'public', f!)), f).toBe(true)
      }
    }
  })

  it('the painted files are valid playback archives without the source illustration', () => {
    for (const o of OUTFITS) {
      const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public', o.painted!)))
      const files = unpackAvatar(bytes)
      expect(validateAvatarFiles(files), o.id).toEqual([])
      expect(Object.keys(files)).not.toContain('source.png')
      expect(bytes.byteLength, `${o.id} stays small`).toBeLessThan(600_000)
    }
  })
})
