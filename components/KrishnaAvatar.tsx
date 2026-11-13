'use client'
// Real-time 3D Krishna, rendered on the user's own device (three.js / WebGL).
//
// Replaces the streamed-video avatar: there is no per-minute server cost — the only
// network traffic is a one-time GLB download (cached by the browser/CDN) plus the TTS
// audio we already fetch. Lip-sync is computed locally from that audio.
//
// If the GLB isn't present yet, falls back to the 2D poster with a voice-reactive aura.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { avatarModelUrl, AVATAR_POSTER_URL, OUTFITS, OUTFIT_NODE_PREFIX, outfitsPresentInModel, outfitsWithModels } from '@/lib/avatar/config'
import {
  analyseSpectrum, bandsToVisemes, smoothVisemes, resolveMorphIndices,
  ZERO_VISEMES, type VisemeWeights,
} from '@/lib/avatar/lipsync'

type Props = {
  getAnalyser: () => AnalyserNode | null
  outfitId: string
  /** Reports which outfits the loaded model actually contains (empty in poster mode). */
  onModelInfo?: (info: { mode: 'model' | 'poster'; outfits: string[] }) => void
}

type Mode = 'loading' | 'model' | 'poster'

export default function KrishnaAvatar({ getAnalyser, outfitId, onModelInfo }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const auraRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>('loading')
  // Each outfit is its own model file: switching outfit loads that file (cached after the first time).
  const modelUrl = avatarModelUrl(outfitId)
  // Latest props for the long-lived render loop, synced after each render.
  const getAnalyserRef = useRef(getAnalyser)
  const onModelInfoRef = useRef(onModelInfo)
  const applyOutfitRef = useRef<(id: string) => void>(() => {})
  const outfitRef = useRef(outfitId)
  useLayoutEffect(() => {
    getAnalyserRef.current = getAnalyser
    onModelInfoRef.current = onModelInfo
    outfitRef.current = outfitId
  })

  useEffect(() => { applyOutfitRef.current(outfitId) }, [outfitId])

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined
    const mount = mountRef.current
    if (!mount) return

    ;(async () => {
      // A new outfit: show the glow again while its model loads, then fade it in.
      setMode('loading')
      try {
        const THREE = await import('three')
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js')
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js')
        if (disposed) return

        const loader = new GLTFLoader()
        loader.setMeshoptDecoder(MeshoptDecoder)
        const gltf = await loader.loadAsync(modelUrl)
        if (disposed) return

        // ── Renderer (tuned for mid-range Android phones) ───────────────
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
        const renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5, alpha: true, powerPreference: 'low-power' })
        renderer.setPixelRatio(dpr)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.05
        mount.appendChild(renderer.domElement)

        const scene = new THREE.Scene()
        const pmrem = new THREE.PMREMGenerator(renderer)
        const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
        scene.environment = envTex

        // Soft divine lighting: cool sky fill, warm key, blue rim for the glow silhouette.
        scene.add(new THREE.HemisphereLight(0xcfdcff, 0x1b1236, 0.9))
        const key = new THREE.DirectionalLight(0xffe2b8, 1.6)
        key.position.set(-1.5, 2.5, 3)
        scene.add(key)
        const rim = new THREE.DirectionalLight(0x8fb6ff, 2.2)
        rim.position.set(1.5, 2, -3)
        scene.add(rim)

        const root = gltf.scene

        // A flat, layered cut-out (painted artwork on unlit planes) rather than a sculpted body:
        // show the paint exactly as painted (no tone mapping), draw the layers back to front,
        // and don't add the procedural sway below, which would skew flat layers.
        let unlit = 0
        const layers: { mesh: import('three').Mesh; z: number }[] = []
        root.traverse((o) => {
          const m = o as import('three').Mesh
          if (!m.isMesh) return
          const mats = Array.isArray(m.material) ? m.material : [m.material]
          for (const mat of mats) {
            if ((mat as import('three').MeshBasicMaterial).isMeshBasicMaterial) {
              unlit++
              mat.toneMapped = false
              if (mat.transparent) mat.depthWrite = false
            }
          }
          m.geometry.computeBoundingBox()
          layers.push({ mesh: m, z: m.geometry.boundingBox?.getCenter(new THREE.Vector3()).z ?? 0 })
        })
        layers.sort((a, b) => a.z - b.z).forEach((l, i) => { l.mesh.renderOrder = i })
        // VRM 0.x (older VRoid Studio exports) faces -Z; turn it to face the camera.
        const ext = (gltf.parser.json as { extensions?: Record<string, unknown> }).extensions
        if (ext?.VRM && !ext?.VRMC_vrm) root.rotation.y = Math.PI
        scene.add(root)

        // ── Frame the full body like a phone wallpaper ──────────────────
        root.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(root, true) // precise: respects skinning
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const flat = unlit > 0 && size.z < size.y * 0.05
        const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
        const fitHeight = size.y * 1.08
        const dist = fitHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
        camera.position.set(center.x, center.y + size.y * 0.04, center.z + dist)
        camera.lookAt(center.x, center.y + size.y * 0.02, center.z)

        // ── Outfits: one visible `outfit_<id>` node at a time ───────────
        const outfitNodes = new Map<string, import('three').Object3D>()
        root.traverse((o) => {
          if (o.name.startsWith(OUTFIT_NODE_PREFIX)) outfitNodes.set(o.name, o)
        })
        // Outfits as nodes inside one file, or (no nodes) one file per outfit.
        const present = outfitNodes.size ? outfitsPresentInModel(Array.from(outfitNodes.keys())) : outfitsWithModels()
        applyOutfitRef.current = (id: string) => {
          if (!outfitNodes.size) return
          const target = OUTFIT_NODE_PREFIX + (present.includes(id) ? id : present[0] ?? id)
          outfitNodes.forEach((node, name) => { node.visible = name === target })
        }
        applyOutfitRef.current(outfitRef.current)

        // ── Face morph targets ─────────────────────────────────────────
        type FaceMesh = { influences: number[]; idx: ReturnType<typeof resolveMorphIndices> }
        const faces: FaceMesh[] = []
        root.traverse((o) => {
          const m = o as import('three').Mesh
          if (m.isMesh && m.morphTargetDictionary && m.morphTargetInfluences) {
            const idx = resolveMorphIndices(m.morphTargetDictionary)
            if (Object.keys(idx).length) faces.push({ influences: m.morphTargetInfluences, idx })
          }
        })

        // ── Bones for procedural idle (used when the GLB has no idle clip) ──
        const findBone = (re: RegExp) => {
          let found: import('three').Object3D | undefined
          root.traverse((o) => { if (!found && (o as import('three').Bone).isBone && re.test(o.name)) found = o })
          return found
        }
        const spine = findBone(/spine2|chest|upperchest|spine1|spine/i)
        const head = findBone(/^(mixamorig:)?head$|head$/i)
        const base = new Map<import('three').Object3D, import('three').Euler>()
        for (const b of [spine, head]) if (b) base.set(b, b.rotation.clone())

        // ── Baked animations: Idle always; Speak (if provided) fades in while the voice plays ──
        let mixer: import('three').AnimationMixer | undefined
        let idleAction: import('three').AnimationAction | undefined
        let speakAction: import('three').AnimationAction | undefined
        const idleClip = gltf.animations.find((c) => /idle|breath/i.test(c.name)) ?? gltf.animations[0]
        const speakClip = gltf.animations.find((c) => /speak|talk/i.test(c.name))
        if (idleClip) {
          mixer = new THREE.AnimationMixer(root)
          idleAction = mixer.clipAction(idleClip)
          idleAction.play()
          if (speakClip && speakClip !== idleClip) {
            speakAction = mixer.clipAction(speakClip)
            speakAction.setEffectiveWeight(0)
            speakAction.play()
          }
        }
        let speaking = 0

        // ── Resize ─────────────────────────────────────────────────────
        const resize = () => {
          const w = mount.clientWidth || 1
          const h = mount.clientHeight || 1
          renderer.setSize(w, h, false)
          renderer.domElement.style.width = '100%'
          renderer.domElement.style.height = '100%'
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
        const ro = new ResizeObserver(resize)
        ro.observe(mount)
        resize()

        // ── Frame loop ─────────────────────────────────────────────────
        const timer = new THREE.Timer()
        let visemes: VisemeWeights = { ...ZERO_VISEMES }
        let freq: Uint8Array<ArrayBuffer> | null = null
        let nextBlink = 1.5 + Math.random() * 3
        let blinkT = -1

        const setShape = (f: FaceMesh, shape: keyof FaceMesh['idx'], w: number) => {
          const list = f.idx[shape]
          if (list) for (const i of list) f.influences[i] = w
        }

        const frame = (now: number) => {
          timer.update(now)
          const dt = Math.min(timer.getDelta(), 0.1)
          const t = timer.getElapsed()

          // Lip-sync from the live TTS audio
          let target: VisemeWeights = ZERO_VISEMES
          let level = 0
          const analyser = getAnalyserRef.current()
          if (analyser) {
            if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount)
            analyser.getByteFrequencyData(freq)
            const bands = analyseSpectrum(freq, analyser.context.sampleRate, analyser.fftSize)
            level = bands.volume
            target = bandsToVisemes(bands)
          }
          visemes = smoothVisemes(visemes, target, dt)
          if (process.env.NODE_ENV !== 'production') {
            (window as unknown as { __krishnaVisemes?: VisemeWeights }).__krishnaVisemes = visemes
          }

          // Blink every few seconds
          if (blinkT < 0 && t > nextBlink) blinkT = 0
          let blink = 0
          if (blinkT >= 0) {
            blinkT += dt
            blink = blinkT < 0.07 ? blinkT / 0.07 : Math.max(0, 1 - (blinkT - 0.07) / 0.09)
            if (blinkT > 0.16) { blinkT = -1; nextBlink = t + 2 + Math.random() * 4 }
          }

          for (const f of faces) {
            // A model with a single "mouth open" shape gets the overall openness of the mouth.
            const jawOnly = !f.idx.oh && !f.idx.ou && !f.idx.ee && !f.idx.ih
            const open = Math.min(1, visemes.aa + 0.7 * visemes.oh + 0.5 * visemes.ou + 0.4 * visemes.ee + 0.4 * visemes.ih)
            setShape(f, 'aa', jawOnly ? open : visemes.aa)
            setShape(f, 'oh', visemes.oh)
            setShape(f, 'ou', visemes.ou)
            setShape(f, 'ee', visemes.ee)
            setShape(f, 'ih', visemes.ih)
            setShape(f, 'blink', blink)
            setShape(f, 'smile', 0.22) // serene half-smile, as in the reference art
          }

          if (speakAction && idleAction) {
            // Ease into the speaking motion while there's voice, and back to idle after a pause.
            const want = level > 0.02 ? 1 : 0
            speaking += (want - speaking) * Math.min(1, dt * (want ? 4 : 1.5))
            speakAction.setEffectiveWeight(speaking)
            idleAction.setEffectiveWeight(1 - speaking)
          }
          mixer?.update(dt)
          // Procedural breathing + gentle head motion layered on top (sculpted models only)
          if (!flat && spine && base.has(spine)) {
            const b = base.get(spine)!
            spine.rotation.x = (mixer ? spine.rotation.x : b.x) + Math.sin(t * 1.4) * 0.012
          }
          if (!flat && head && base.has(head)) {
            const b = base.get(head)!
            head.rotation.y = (mixer ? head.rotation.y : b.y) + Math.sin(t * 0.5) * 0.04
            head.rotation.x = (mixer ? head.rotation.x : b.x) + Math.sin(t * 0.8) * 0.015 + level * 0.06
          }

          renderer.render(scene, camera)
        }
        renderer.setAnimationLoop(frame)

        // Don't burn battery while the tab is hidden
        const onVis = () => {
          if (document.hidden) {
            renderer.setAnimationLoop(null)
          } else {
            timer.reset() // drop the time spent hidden
            renderer.setAnimationLoop(frame)
          }
        }
        document.addEventListener('visibilitychange', onVis)

        setMode('model')
        onModelInfoRef.current?.({ mode: 'model', outfits: present })

        cleanup = () => {
          document.removeEventListener('visibilitychange', onVis)
          ro.disconnect()
          renderer.setAnimationLoop(null)
          root.traverse((o) => {
            const m = o as import('three').Mesh
            if (m.isMesh) {
              m.geometry?.dispose()
              const mats = Array.isArray(m.material) ? m.material : [m.material]
              for (const mat of mats) {
                for (const v of Object.values(mat)) if (v && (v as import('three').Texture).isTexture) (v as import('three').Texture).dispose()
                mat.dispose()
              }
            }
          })
          envTex.dispose()
          pmrem.dispose()
          renderer.dispose()
          renderer.domElement.remove()
        }
      } catch (err) {
        if (disposed) return
        console.info('[avatar] 3D model unavailable, using 2D poster:', err instanceof Error ? err.message : err)
        setMode('poster')
        onModelInfoRef.current?.({ mode: 'poster', outfits: [] })
      }
    })()

    return () => { disposed = true; cleanup?.() }
  }, [modelUrl])

  // ── Poster fallback: voice-reactive aura + breathing ──────────────
  useEffect(() => {
    if (mode !== 'poster') return
    let raf = 0
    let level = 0
    let freq: Uint8Array<ArrayBuffer> | null = null
    const tick = () => {
      const analyser = getAnalyserRef.current()
      let target = 0
      if (analyser) {
        if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(freq)
        target = Math.min(1, analyseSpectrum(freq, analyser.context.sampleRate, analyser.fftSize).volume * 3)
      }
      level += (target - level) * (target > level ? 0.35 : 0.08)
      auraRef.current?.style.setProperty('--voice', level.toFixed(3))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  // The still picture is only the fallback when the 3D model can't run. While the model loads,
  // the stage shows just its soft glow (showing a poster then would flash a different picture,
  // and a different outfit if that outfit had no poster), and the model fades in.
  const poster = OUTFITS.find((o) => o.id === outfitId)?.poster ?? AVATAR_POSTER_URL

  return (
    <div className="avatar-stage" data-mode={mode}>
      <div ref={mountRef} className="avatar-canvas" aria-hidden={mode !== 'model'} />
      {mode === 'loading' && <div className="avatar-loading" aria-hidden="true" />}
      {mode === 'poster' && (
        <div ref={auraRef} className="avatar-poster">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={poster} alt="Krishna" draggable={false} />
        </div>
      )}
    </div>
  )
}
