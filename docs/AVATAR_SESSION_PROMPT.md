# Prompt for the Blender session (copy everything below the line)

Paste this into a Claude Code session opened **in your local `krishna-ai` folder**, with Blender
open, the Blender MCP add-on connected (sidebar → BlenderMCP → Connect) and `blender` showing as
connected under `/mcp`.

---

You're building the 3D avatar for Kanha, an app that helps people in India reflect on their lives with the Bhagavad Gita. The figure is Krishna as a youth, shown as an artistic, AI-animated depiction out of reverence. The app is clear that it is an AI, not God and not Krishna. Millions of people worship Krishna, so this has to be beautiful, dignified and respectful: no caricature, no cartoon exaggeration, nothing sexualised, nothing comic.

**Read first:**
- `docs/AVATAR_PIPELINE.md`: the export contract (file name, bones, shape keys, outfit nodes, budgets, compression). Everything you export must meet it.
- `public/avatar/poster-divine-v2.webp`: the reference image for the face, colouring and the "Divine" outfit.
- Skills in `.claude/skills/`: start with `blender-director`, then `character-artist`, `sculpting`, `retopology`, `uv-workflow`, `texture-workflow`, `materials`, `lookdev`, `hair-groom`, `cloth-sim`, `rigging`, `animation`, `stylized-style`, `asset-optimization`, `export-pipeline` and `qa-review`.

**How to work:**
- First check the Blender MCP connection (get the scene info) and tell me the Blender version.
- Work in stages. After each stage, render a front view, a three-quarter view and a close-up of the face (or take viewport screenshots), show them to me, and wait for my "go" before moving on.
- Save the working file as `~/Kanha-avatar/krishna_source.blend` (outside the repo; .blend files are large) and save a numbered copy after each stage so we can go back.
- Only `public/avatar/krishna.glb` goes into the repo, at the end.
- Don't model the body from cubes. Start from a free base mesh: **MPFB2** (the MakeHuman plug-in for Blender; its assets are CC0, which allows commercial use) set to a slim youth of about 1.4 m, or tell me if you think another free base is better. Then stylise it by sculpting.

## The character

- **Age and build:** a youth of about 15–16 in appearance, slender, graceful and calm; 1.4 m tall. Natural proportions, slightly idealised (gentle, not muscular). Not chibi, not anime-large eyes.
- **Skin:** the traditional dark-cloud blue (*śyāma*), a soft blue with violet in it, about `#4F6BD8` in mid-tones, `#3A4FB0` in shadows and `#7C94F0` where light hits. Subtle subsurface feel, baked into the base colour. Even and matte, not plastic.
- **Face:** oval, serene and kind. Almond-shaped, deep brown eyes with long lashes, looking slightly downward and softly at the viewer. A small, straight nose. Full lips with a gentle half-smile (the `smile` shape key held at about 22%). Smooth brow. No beard.
- **Tilak:** a thin U-shaped mark (ūrdhva puṇḍra) from the bridge of the nose up the forehead, cream-white `#F3E9D2`, with a small red-saffron vertical line in the centre (`#D9480F`). Keep it as a decal or part of the texture, not geometry.
- **Hair:** long, dark (`#14121F`, with blue-black highlights), softly wavy curls to the shoulders. Part of it is gathered into a small knot on top of the head, where the crown or feather sits. Use hair cards (for the phone budget), not particle hair.
- **Ears:** makara-kuṇḍala earrings (small gold fish-shaped drops), present in all outfits except Fusion, where they become small gold studs.
- **Signature items:**
  - **Peacock feather:** one, upright from the top-knot or crown, in every outfit. The eye is teal `#0F7C8A` and royal blue, ringed with gold and a green barb fringe.
  - **Flute (bansuri):** about 45 cm, bamboo with gold bands. Held across the lips in the Idle pose, or in the right hand by the waist. Give it a bone or parent it to the right hand.
- **Posture:** relaxed. Weight on one leg (tribhanga, a gentle three-bend stance, only slightly), shoulders soft, head slightly tilted.

Body, face, hair, earrings and the feather sit outside the outfits. Everything that changes with the look goes inside its outfit node (see `docs/AVATAR_PIPELINE.md`).

## The four outfits (one `outfit_*` node each, all skinned to the same armature)

### 1. Divine: `outfit_divine` (build this first; it's the default and matches the reference)
- **Dhoti:** silk, draped and pleated to the ankles, with an **iridescent pastel sheen** shifting from lilac `#E6C8FF` through sky blue `#A9D8FF` to pearl white. Use `KHR_materials_iridescence` on a light base.
- **Upper body:** bare chest under the garlands, with a **yellow-gold silk dupatta** (`#E8B84A`, with a slight satin sheen) over the shoulders, falling down both sides past the knees in soft folds.
- **Garlands:**
  - a long **pearl and soft-pink flower garland** (vaijayantī mālā) to the knees, with the pearls slightly emissive (`#FFF6E8`, low strength);
  - a shorter pearl necklace;
  - a jewelled pendant at the chest (pink stone, gold setting).
- **Jewellery:** gold armlets (bajuband) with a pink stone, a few thin bangles on each wrist, a gold waist chain over the dhoti, and gold anklets.
- **Crown:** a small, delicate pink-and-gold mukut with pearls around the top-knot, with the peacock feather rising from it.
- **Mood:** luminous, soft, otherworldly. A gentle glow on the pearls and the edges of the silk (the app adds a cool rim light).

### 2. Royal: `outfit_royal` (Krishna as the prince of Dwarka)
- **Dhoti:** deep royal-blue silk (`#1D2A6B`), with wide **gold zari borders** (`#C9A24A`, metallic) and a fan of pleats at the front.
- **Upper body:** a fitted, sleeveless **angarkha-style tunic** in ivory silk with gold brocade, or a bare chest with a heavy jewelled collar; choose whichever reads better at phone size and show me both.
- **Shawl:** a **pītāmbara** (yellow silk shawl, `#F2C14E`) draped from one shoulder across the body.
- **Jewellery:** heavier and regal. A broad gold necklace with rubies and emeralds, layered chains, broad armlets, gold cuffs, rings, and a jewelled belt.
- **Crown:** a tall, ornate golden **kirīṭa** (a temple-style crown with tiers and small jewels), with the peacock feather tucked at the side.
- **Mood:** majestic and composed, still gentle in the face. Rich gold, but not gaudy: keep the textures fine, not noisy.

### 3. Pastoral: `outfit_pastoral` (the cowherd of Vrindavan)
- **Dhoti:** simple, shorter (to mid-calf), in unbleached cotton tied practically, saffron-ochre (`#E2A35B`) with a thin maroon border.
- **Upper body:** bare, with a light **cotton angavastram** (scarf) in cream-yellow (`#F3E3B5`) over one shoulder.
- **Garland:** a fresh **forest-flower garland** of marigold, tulsi leaves and small white jasmine (`#F59E0B`, `#3F7D3A`, `#FFFFFF`), to the waist.
- **Jewellery:** minimal. A thin black thread with a small bead at the neck, one plain silver anklet, and no crown.
- **Head:** the peacock feather tucked straight into the hair knot, plus a few small flowers in the hair.
- **Extras:** a plain wooden bansuri, no gold bands. Barefoot.
- **Mood:** earthy, warm, playful-gentle. Sunlit village evening. Matte, natural fabrics, no sheen.

### 4. Fusion: `outfit_fusion` (contemporary, for younger users; still reverent)
- **Kurta:** a straight, knee-length kurta in off-white linen (`#F4F1EA`), with fine **peacock-feather embroidery** in teal and deep green (`#1F7A5A`) along the placket and cuffs.
- **Bottoms:** slim churidar or straight pants in deep charcoal (`#2B2B3A`).
- **Jacket:** a sleeveless **Nehru (bandhgala) jacket** in charcoal with tiny gold buttons, worn open or closed; show me both.
- **Accessories:**
  - a thin gold chain with a small peacock-feather pendant;
  - one gold kada (bangle);
  - small gold stud earrings instead of the makara drops;
  - the peacock feather pinned in the hair as a small, elegant accent, not a crown;
  - the bansuri in matte black with gold bands.
- **Mood:** modern, clean, calm. Still clearly Krishna (blue skin, feather, flute) and dignified, not a fashion shoot.

## Stages (show me renders after each)

1. **Setup:** check the MCP connection, set scene units to metres, import the reference image as a background plane, make a project collection, and save.
2. **Base body:** create the MPFB2 base at 1.4 m; adjust it to a slender youth with a calm posture. Show me the front and side views.
3. **Head and face:** sculpt the stylised face to match the reference: eyes, gentle smile, nose and lips. Add the tilak as a texture decal. This is the most important stage, so take time and show me close-ups.
4. **Hair:** hair cards with the top-knot; then the earrings and the peacock feather.
5. **Retopology and UVs:** clean, animation-ready topology, with good loops around the eyes and mouth (needed for the mouth shapes). Use one 2048² UV atlas for body, face and hair.
6. **Outfit Divine:** dhoti, dupatta, garlands, jewellery, crown and flute. Use cloth simulation for the drape, then apply it so it becomes static geometry.
7. **Materials and look:** skin, iridescent silk, gold, pearls (emissive) and feather. Render under soft key light plus a cool rim light, and compare against the reference.
8. **Rig:** a Rigify or Mixamo-compatible armature with bones named so `Spine`/`Chest` and `Head` are findable. Weight the body, then transfer weights to the outfit with a Data Transfer modifier. The flute follows the right hand.
9. **Face shape keys:** `aa`, `oh`, `ou`, `ee`, `ih`, `blink` and `smile` (the "Minimal" names in the pipeline doc). Show me each one at 100%.
10. **Idle animation:** an action named `Idle`, 6 seconds, looping: gentle breathing, a slight weight shift, a blink, and fingers resting on the flute.
11. **Export and check:** glTF binary with Y-up, in metres, including shape keys, the Idle action and iridescence. Name it `krishna_source.glb`, then compress:
    `npx @gltf-transform/cli optimize ~/Kanha-avatar/krishna_source.glb public/avatar/krishna.glb --compress meshopt --texture-compress webp --texture-size 2048`
    Check the budgets: under 60k triangles, under 10 MB (ideally 6 MB), 20 or fewer materials. Then run `npm run dev` and open `http://localhost:3000/avatar-preview`; check the outfit list, the Test voice button and the idle motion.
12. **Commit:** once I approve, commit only `public/avatar/krishna.glb` with a clear message and push.

Then repeat stages 6–7 and 11 for **Royal**, **Pastoral** and **Fusion**, adding each as another `outfit_*` node in the same file and armature.

**If you get stuck:**
- If a stage is beyond what scripting can do well (fine facial sculpting especially), say so plainly and suggest the best alternative. For example, I can do that step by hand, or we can use an image-to-3D draft (TRELLIS) as a sculpting base.
- Don't fake progress: if a render looks wrong, show me anyway and say what's wrong.
