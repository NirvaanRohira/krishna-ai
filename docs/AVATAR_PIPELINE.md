# Krishna 3D avatar: model spec and pipeline

The app loads **one GLB file** and handles everything else: lighting, framing, idle motion, blinking, lip-sync and outfit switching (`components/KrishnaAvatar.tsx`). This page is the brief for whoever builds that file. Hand it to the 3D artist as-is.

Reference art: `public/avatar/poster-divine.webp` (the "Divine" look). Outfits planned for launch: **Divine, Royal, Pastoral, Fusion**.

## Ways to get the model

| Route | Cost / time | Result | Notes |
|---|---|---|---|
| **A. Commission a stylised character artist** (ArtStation, Fiverr Pro, Indian 3D/animation studios) | Roughly $500–2,500 (₹40k–2L) per base character, plus about $150–400 per outfit; 2–5 weeks | Best quality and most faithful to the reference | Send them this file, the reference image and the screenshots. Ask for Blender source files too. |
| **B. AI image-to-3D, then clean up in Blender** (Tripo, Meshy, Hunyuan3D, Higgsfield 3D) | Tool credits plus 3–10 days of Blender work | Fast first draft. The generated mesh has **no rig and no face shapes**, and topology needs retopo | Use it as a base or blockout, then do the rigging steps below |
| **C. VRoid Studio** (free) | 1–3 days | Anime style. Rig, face shapes and an outfit editor are built in | Export **VRM**. The app reads VRoid's `Fcl_*` face shapes and turns VRM 0.x models to face the camera. Fastest way to try the whole thing end to end. |

Recommendation: start with **C** for a working prototype this week, and run **A** in parallel for the launch model.

## Export contract (what the code expects)

**File:** `public/avatar/krishna.glb`, or a CDN URL in `NEXT_PUBLIC_AVATAR_MODEL_URL`. Blender's glTF exporter with default axes (Y-up, faces +Z), in metres. Krishna as a youth is about 1.3–1.5 m tall. The camera frames the full body automatically.

**Skeleton:** one armature. Standard bone names (Mixamo, Rigify or Auto-Rig Pro) are fine. The code looks for bones matching `Spine/Chest` and `Head` to add breathing and head motion.

**Face shape keys (blendshapes).** Any **one** of these naming sets works:

| Shape | Oculus visemes | ARKit | VRoid | Minimal |
|---|---|---|---|---|
| open jaw | `viseme_aa` | `jawOpen` | `Fcl_MTH_A` | `aa` |
| round "oh" | `viseme_O` | `mouthFunnel` | `Fcl_MTH_O` | `oh` |
| pucker "oo" | `viseme_U` | `mouthPucker` | `Fcl_MTH_U` | `ou` |
| spread "ee" | `viseme_E` | `mouthStretchLeft/Right` | `Fcl_MTH_E` | `ee` |
| "ih" | `viseme_I` | — | `Fcl_MTH_I` | `ih` |
| blink | — | `eyeBlinkLeft/Right` | `Fcl_EYE_Close` | `blink` |
| soft smile | — | `mouthSmileLeft/Right` | `Fcl_MTH_Fun` | `smile` |

Blender's **Faceit** add-on generates the ARKit set semi-automatically. Otherwise the five mouth shapes plus blink and smile take about a day to sculpt by hand. The smile is held at about 22% for the serene half-smile in the reference.

**Outfits:** a top-level object (an empty, or a mesh with children) per outfit, named exactly:

```
outfit_divine   outfit_royal   outfit_pastoral   outfit_fusion
```

Every outfit mesh is skinned to the **same armature**. In Blender, use a Data Transfer modifier to copy vertex weights from the body. Accessories that change with the look (crown vs. mukut with peacock feather, flute, garlands, jewellery) go **inside** the outfit object. Body, face and hair go outside all of them. The app shows one outfit node and hides the rest. Outfits missing from the file are greyed out in the picker as "Soon", so you can ship with only `outfit_divine` and add the others later.

**Animation (optional but recommended):** an action named `Idle` with gentle breathing, weight shift and fingers on the flute, about 4–8 s looping. If there's no clip, the code adds procedural breathing and head sway.

**Materials:** standard Principled BSDF, which exports to glTF PBR.
- The iridescent silk in the reference: use the glTF **iridescence** extension (`KHR_materials_iridescence`). three.js renders it natively.
- Glowing pearls and garland: an **emissive** colour. The app adds a cool rim light for the halo outline.
- Skin: one blue tone with subtle subsurface baked into the base colour.

## Mobile budget (most users are on mid-range Android)

| | Target | Hard cap |
|---|---|---|
| Triangles (body + one visible outfit) | 30k | 60k |
| Textures | One 2048² atlas for body/face/hair, one 2048² per outfit | 4096² anywhere |
| Draw calls / materials | ≤ 12 | 20 |
| File size after compression | ≤ 6 MB | 10 MB |

Compress before shipping:

```bash
npx @gltf-transform/cli optimize krishna_source.glb public/avatar/krishna.glb \
  --compress meshopt --texture-compress webp --texture-size 2048
```

The loader already includes the Meshopt decoder. Avoid Draco and KTX2: both need extra decoder files.

## Checking a model locally

```bash
npm run dev
```

Then open <http://localhost:3000/avatar-preview>. No login is needed and it makes no LLM or TTS calls. The page shows which `outfit_*` nodes it found, lets you switch outfits, and has a **Test voice** button that plays a synthetic vowel sweep through the same lip-sync path real speech uses. The page returns 404 in production builds.

## How lip-sync works (for the curious)

The TTS audio is routed through a WebAudio `AnalyserNode` (`hooks/useTTS.ts`). On each frame, `lib/avatar/lipsync.ts` measures speech energy in three formant bands. Loudness opens the jaw; low-band dominance rounds the lips ("oh", "oo"); high-band dominance spreads them ("ee", "ih"). The result is smoothed with a fast attack and a slower release. It needs no phoneme data from the TTS provider, so switching between Polly, Google and Sarvam never affects the avatar.
