import { describe, it, expect, beforeEach } from 'vitest'
import { OUTFITS, loadSavedOutfit, saveOutfit, outfitsPresentInModel, DEFAULT_OUTFIT_ID, avatarModelUrl } from '@/lib/avatar/config'

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

  it('loads the model painted for the current theme', () => {
    expect(avatarModelUrl('light')).toBe('/avatar/krishna-light.glb')
    expect(avatarModelUrl('dark')).toBe('/avatar/krishna-dark.glb')
  })
})
