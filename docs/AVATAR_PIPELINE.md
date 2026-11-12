# Krishna 3D avatar: model spec and pipeline

The app loads **one GLB file** and handles everything else: lighting, framing, idle motion, blinking, lip-sync and outfit switching (`components/KrishnaAvatar.tsx`). This page is the brief for whoever builds that file. Hand it to the 3D artist as-is.

Reference art: `public/avatar/poster-divine-v2.webp` (the "Divine" look). Outfits planned for launch: **Divine, Royal, Pastoral, Fusion**.

## Ways to get the model

| Route | Cost / time | Result | Notes |
|---|---|---|---|
| **A. Commission a stylised character artist** (ArtStation, Fiverr Pro, Indian 3D/animation studios) | Roughly $500–2,500 (₹40k–2L) per base character, plus about $150–400 per outfit; 2–5 weeks | Best quality and most faithful to the reference | Send them this file, the reference image and the screenshots. Ask for Blender source files too. |
| **B. AI image-to-3D, then clean up in Blender** (Tripo, Meshy, Hunyuan3D, Higgsfield 3D) | Tool credits plus 3–10 days of Blender work | Fast first draft. The generated mesh has **no rig and no face shapes**, and topology needs retopo | Use it as a base or blockout, then do the rigging steps below |
| **C. VRoid Studio** (free) | 1–3 days | Anime style. Rig, face shapes and an outfit editor are built in | Export **VRM**. The app reads VRoid's `Fcl_*` face shapes and turns VRM 0.x models to face the camera. Fastest way to try the whole thing end to end. |

Recommendation: start with **C** for a working prototype this week, and run **A** in parallel for the launch model.

### Free tools (no Higgsfield credits needed)

| Step | Free option | Licence to check |
|---|---|---|
| Image → 3D draft | **Microsoft TRELLIS** (free demo on Hugging Face Spaces, or run it on a Colab/Cloud Run GPU) | MIT, commercial OK |
| Image → 3D draft | **Tencent Hunyuan3D 2.x** (free HF Space; open weights) | Tencent community licence: excludes EU/UK/South Korea, conditions above 1M MAU. India is OK, but read it |
| Image → 3D draft | Tripo, Meshy free tiers (a few models a month) | Free-tier outputs may be non-commercial or CC BY; check before launch |
| Anime-style whole character, with rig and face shapes | **VRoid Studio** | Free; you own your model |
| Body rig + animations | **Mixamo** (free with an Adobe account) | Free to use in commercial projects |
| Face shapes, cleanup, export | **Blender** + **Blender MCP** (open source) | Free |

A good zero-cost path: VRoid for the first playable avatar this week; TRELLIS → Mixamo → Blender for the realistic Krishna; an artist for the final face.

### Can AI tools build it for us? (Blender MCP, computer use, image-to-3D)

Partly. Here is what each one is good for:
- **Image-to-3D** (Tripo, Meshy, Hunyuan3D, Rodin, Higgsfield 3D): gives you a textured mesh from the reference art in minutes. Some can auto-rig the body. They **don't** produce the facial shape keys needed for lip-sync, and clothing comes out fused to the body. **Workaround that fits our code:** generate each outfit as a *whole character* (body + clothes) and put each one under its own `outfit_<id>` node, all bound to the same skeleton. The viewer swaps whole characters, so no cloth fitting is needed.
- **Blender MCP** (lets Claude run Blender through scripts): good for the mechanical, repeatable steps. Importing the meshes, transferring weights to one armature, naming the `outfit_*` nodes, building the five mouth shapes plus blink by script, setting up an Idle action, then exporting and compressing the GLB. It's **not** good at artistic sculpting.
- **Computer-use agents clicking through the Blender UI**: slow and brittle. Prefer Blender MCP.
- **Practical AI pipeline:** image-to-3D for each outfit → retopo/cleanup (an artist, or an auto-retopo tool) → Mixamo or the tool's auto-rig → Blender MCP for shape keys, naming and export → `/avatar-preview` to check. Expect 3–10 days with one person who knows basic Blender, versus 2–5 weeks for a commissioned model.
- **Quality bar:** AI meshes of faces often look uncanny up close. For a religious figure, have the face (at least) cleaned up by an artist before launch.

## Building it with Claude + Blender on your own computer

Blender MCP talks to Blender over `localhost:9876`, so this has to run in a Claude Code session **on the
computer where Blender is installed** (Claude desktop app → Code, or the `claude` CLI), not in a cloud session.

One-time setup:
1. Install the Blender MCP add-on in Blender (github.com/ahujasid/blender-mcp: download `addon.py`,
   Edit → Preferences → Add-ons → Install, enable it, then in the 3D view sidebar (N) → BlenderMCP → **Connect**).
2. Install `uv` (`brew install uv` on a Mac), then in your local clone of this repo:
   `claude mcp add blender -- uvx blender-mcp`
3. `git pull` so you have `.claude/skills/` with the Blender skills (from arjun988/blender-skills, MIT; only
   the character-relevant ones are included: blender-director, character-artist, sculpting, retopology,
   uv-workflow, texture-workflow, materials, lookdev, hair-groom, cloth-sim, rigging, animation, lighting,
   stylized-style, asset-optimization, export-pipeline, qa-review, plus shared references).

Starting prompt to paste into that session (the full version, with the four outfits described, is in `docs/AVATAR_SESSION_PROMPT.md`):

> Read docs/AVATAR_PIPELINE.md (the export contract below is what the app needs) and look at
> public/avatar/poster-divine-v2.webp as the reference. Using the Blender MCP and the blender-director,
> character-artist and rigging skills, build the Divine Krishna as a stylised youth, about 1.4 m tall:
> one armature with Spine/Chest/Head bones, face shape keys aa, oh, ou, ee, ih, blink and smile, the outfit
> under a node named `outfit_divine`, an `Idle` action, under 60k triangles, then export and compress to
> public/avatar/krishna.glb as in the "Compress" step. Work in stages and show me a render after each one
> (blockout, sculpt, textures, rig, shape keys) before moving on. This is an artistic, reverent depiction
> of Krishna for a spiritual app: keep it dignified, no caricature.

Check the result at `/avatar-preview` (`npm run dev`), then commit `public/avatar/krishna.glb`.

## What's live now (alpha): the 2.5D cut-outs

The alpha ships three layered **2.5D cut-outs** made in Blender, one file per outfit, each used on
both themes (no painted glow; the app's stage provides the glow):
`public/avatar/krishna-divine.glb`, `krishna-royal.glb`, `krishna-pastoral.glb`.

- Flat unlit layers on a small rig (`root`, `chest`, `head`, `blink`; Divine also has
  `forearm.L/R`, `drape.L/R`, `tassel`), a `mouthOpen` shape key on the lips (`M_lip`, `M_ulip`),
  and two actions, `Idle` and `Speak` (8 s loops).
- The viewer shows them unlit and untone-mapped (true painted colour), draws the layers back to
  front, fades from `Idle` into `Speak` while the voice plays, and drives `mouthOpen` from the audio.
  It skips its procedural sway for flat models (it would skew the layers). Switching outfit loads
  that outfit's file (cached after the first time).
- Fusion is out of the alpha.
- Compressed with the command under "Compress" (2.9-4.6 MB → 220-360 KB each).
- Check a new export at `/avatar-preview` (Test voice, each outfit, both themes) before shipping.

The full 3D sculpted model described below is still the target for later.

## Export contract (what the code expects)

**File:** one per outfit (`public/avatar/krishna-<outfit>.glb`, set in `lib/avatar/config.ts`), or a single file with `outfit_*` nodes at a CDN URL in `NEXT_PUBLIC_AVATAR_MODEL_URL`. Blender's glTF exporter with default axes (Y-up, faces +Z), in metres. Krishna as a youth is about 1.3–1.5 m tall. The camera frames the full body automatically.

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
outfit_divine   outfit_royal   outfit_pastoral        (fusion: out of the alpha)
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
