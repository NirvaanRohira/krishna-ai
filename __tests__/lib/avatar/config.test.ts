import { describe, it, expect, beforeEach } from 'vitest'
import { OUTFITS, loadSavedOutfit, saveOutfit, outfitsPresentInModel, DEFAULT_OUTFIT_ID } from '@/lib/avatar/config'

describe('avatar config', () => {
  beforeEach(() => window.localStorage.clear())

  it('ships the four launch outfits', () => {
    expect(OUTFITS.map((o) => o.id)).toEqual(['divine', 'royal', 'pastoral', 'fusion'])
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
})
