// Shrinks a .mavatar exported from Mesh Avatar Studio for the web:
//   - the full-size base illustration (built/base.png, and built/base_cloth.png when present)
//     is re-encoded as WebP with alpha (the player decodes images by content, so the name stays);
//   - the editing-only files (source.png, source_under.png, thumbnail.png) are left out:
//     the app never needs them and the original illustration doesn't ship.
// Everything else (rig, eyes, hair mask, sprites) is copied unchanged, and the result is
// checked with mesh-avatar's own validator.
//
//   node scripts/pack-painted-avatar.mjs <in.mavatar> public/avatar/painted/<outfit>.mavatar
//
// Needs `sharp` (installed with Next; otherwise `npm i -D sharp`).

import { readFileSync, writeFileSync } from 'node:fs'
import { packAvatar, unpackAvatar, validateAvatarFiles } from 'mesh-avatar'

const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('usage: node scripts/pack-painted-avatar.mjs <in.mavatar> <out.mavatar>')
  process.exit(1)
}

let sharp
try { sharp = (await import('sharp')).default } catch {
  console.error('sharp is not installed: run `npm i -D sharp` and try again')
  process.exit(1)
}

const EDIT_ONLY = new Set(['source.png', 'source_under.png', 'thumbnail.png'])
const REENCODE = new Set(['built/base.png', 'built/base_cloth.png'])

const files = unpackAvatar(readFileSync(input))
const out = {}
for (const [name, data] of Object.entries(files)) {
  if (EDIT_ONLY.has(name)) continue
  out[name] = REENCODE.has(name)
    ? new Uint8Array(await sharp(data).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer())
    : data
}

const errors = validateAvatarFiles(out)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
const packed = packAvatar(out)
writeFileSync(output, packed)
const before = readFileSync(input).byteLength
console.log(`${output}: ${(before / 1024).toFixed(0)} KB → ${(packed.byteLength / 1024).toFixed(0)} KB`)
