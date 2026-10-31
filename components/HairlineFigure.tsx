'use client'
// Mounts a Hairline figure (an isometric line drawing that answers the pointer) built by
// scripts/build-hairline.mjs. The script loads once, lazily, only where a figure is shown.
import { useEffect, useRef, useState } from 'react'

type Api = { mount: (id: string, el: HTMLElement, opts?: { play?: boolean; intensity?: number; onRead?: (t: string) => void }) => () => void }
const loaded = new Map<string, Promise<void>>()

function load(name: string): Promise<void> {
  let p = loaded.get(name)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = `/hairline/${name}.js`
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`hairline ${name} failed to load`))
      document.head.appendChild(s)
    })
    loaded.set(name, p)
  }
  return p
}

export function HairlineFigure({ name, label, play = true, className }: { name: string; label: string; play?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [caption, setCaption] = useState('')
  useEffect(() => {
    let destroy: (() => void) | undefined
    let live = true
    load(name)
      .then(() => {
        const api = (window as unknown as { __hairline?: Api }).__hairline
        if (live && ref.current && api) destroy = api.mount(name, ref.current, { play, onRead: (t) => live && setCaption(t) })
      })
      .catch(() => { /* decorative: the page works without it */ })
    return () => { live = false; destroy?.() }
  }, [name, play])

  return (
    <figure className={`hairline ${className ?? ''}`}>
      <div ref={ref} className="hairline-stage" role="img" aria-label={label} />
      {caption && caption !== 'rest' && <figcaption className="hairline-read" aria-hidden="true">{caption}</figcaption>}
    </figure>
  )
}
