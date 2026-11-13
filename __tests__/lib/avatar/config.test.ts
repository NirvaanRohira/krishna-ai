import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { unpackAvatar, validateAvatarFiles } from 'mesh-avatar'
import {
  OUTFITS, loadSavedOutfit, saveOutfit, outfitsPresentInModel, DEFAULT_OUTFIT_ID, BASE_MODEL_OUTFIT_ID, avatarModelUrl, outfitsWithModels,
  loadSavedStyle, saveStyle, paintedAvatarUrl, rendererFor, DEFAULT_AVATAR_STYLE,
} from '@/lib/avatar/config'

describe('avatar config', () => {
  beforeEach(() => window.localStorage.clear())

  it('ships the alpha outfits, Royal first (Fusion is out of the alpha)', () => {
    expect(OUTFITS.map((o) => o.id)).toEqual(['royal', 'divine', 'pastoral'])
  })

  it('avatar mode opens on Royal; Divine stays the base model look', () => {
    expect(DEFAULT_OUTFIT_ID).toBe('royal')
    expect(BASE_MODEL_OUTFIT_ID).toBe('divine')
  })

  it('remembers the chosen outfit and ignores unknown ids', () => {
    expect(loadSavedOutfit()).toBe(DEFAULT_OUTFIT_ID)
    saveOutfit('royal')
    expect(loadSavedOutfit()).toBe('royal')
    window.localStorage.setItem('krishna.outfit', 'nonexistent')
    expect(loadSavedOutfit()).toBe(DEFAULT_OUTFIT_ID)
  })

  it('detects which outfits a GLB actually contains from its node names', () => {
    expect(outfitsPresentInModel(['Armature', 'outfit_divine', 'outfit_royal', 'Body'])).toEqual(['royal', 'divine'])
  })

  it('a model with no outfit nodes is one look: Divine', () => {
    expect(outfitsPresentInModel(['Krishna_Rig', 'Krishna', 'root', 'chest', 'head'])).toEqual(['divine'])
  })

  it('each outfit has its own model file, used on both themes', () => {
    expect(avatarModelUrl('divine')).toBe('/avatar/krishna-divine.glb')
    expect(avatarModelUrl('royal')).toBe('/avatar/krishna-royal.glb')
    expect(avatarModelUrl('pastoral')).toBe('/avatar/krishna-pastoral.glb')
    expect(avatarModelUrl('fusion')).toBe('/avatar/krishna-divine.glb') // unknown → the default look
    expect(outfitsWithModels()).toEqual(['royal', 'divine', 'pastoral'])
  })

  it('3D is the default style, the choice is remembered, and unknown values are ignored', () => {
    expect(DEFAULT_AVATAR_STYLE).toBe('3d')
    expect(loadSavedStyle()).toBe('3d')
    saveStyle('painted')
    expect(loadSavedStyle()).toBe('painted')
    window.localStorage.setItem('krishna.avatarStyle', 'video')
    expect(loadSavedStyle()).toBe('3d')
  })

  it('draws each outfit with the chosen style, and falls back to what the outfit has', () => {
    expect(rendererFor('royal', 'painted')).toBe('painted')
    expect(rendererFor('royal', '3d')).toBe('3d')
    expect(paintedAvatarUrl('pastoral')).toBe('/avatar/painted/pastoral.mavatar')
    expect(paintedAvatarUrl('fusion')).toBeNull()
    // Divine is the Blender model only, whatever style is chosen.
    expect(paintedAvatarUrl('divine')).toBeNull()
    expect(rendererFor('divine', 'painted')).toBe('3d')
    expect(rendererFor('fusion', 'painted')).toBe('3d')
  })

  it('every outfit has a picture for the picker and a model on disk, and its painted file if any', () => {
    for (const o of OUTFITS) {
      for (const f of [o.thumbnail ?? o.poster, o.model, ...(o.painted ? [o.painted] : [])]) {
        expect(f, `${o.id}`).toBeTruthy()
        expect(existsSync(join(process.cwd(), 'public', f!)), f).toBe(true)
      }
    }
  })

  it('the painted files are valid playback archives without the source illustration', () => {
    for (const o of OUTFITS.filter((x) => x.painted)) {
      const bytes = new Uint8Array(readFileSync(join(process.cwd(), 'public', o.painted!)))
      const files = unpackAvatar(bytes)
      expect(validateAvatarFiles(files), o.id).toEqual([])
      expect(Object.keys(files)).not.toContain('source.png')
      expect(bytes.byteLength, `${o.id} stays small`).toBeLessThan(600_000)
    }
  })

  it('every outfit has its own full-figure poster on disk (the fallback never shows another outfit)', () => {
    for (const o of OUTFITS) {
      expect(o.poster, o.id).toBeTruthy()
      expect(existsSync(join(process.cwd(), 'public', o.poster!)), o.poster).toBe(true)
    }
    expect(new Set(OUTFITS.map((o) => o.poster)).size).toBe(OUTFITS.length)
  })
})
