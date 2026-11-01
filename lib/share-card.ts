// A page of the book as an image for WhatsApp / Instagram (1080×1350, 4:5).
// Drawn on the person's own device: nothing is uploaded, and the server never renders text
// someone else chose under our name. Only the general parts of a page go on the card
// (verse, title, teaching, practice); "In your life" is about the person and stays private.

export type ShareCardData = {
  bookLatin: string          // "Bhagavad Gita"
  heading: string            // "Adhyāya 5 · Verse 10"
  folio?: string             // "5.10"
  shloka?: string | null     // Devanagari, lines separated by \n
  verseMark?: string | null  // "१०" when there is no Sanskrit text
  title: string
  teaching: string
  practice: string
  site: string               // "kanhacall.vercel.app"
}

export const CARD_W = 1080
export const CARD_H = 1350

const INK = '#3a2716'
const INK_SOFT = '#6b5338'
const RUBRIC = '#7a2e1b'
const GILT = '#a4772b'

type Fonts = { book: string; caps: string; deva: string }

function cssFont(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `${v}, ${fallback}` : fallback
}

export function resolveFonts(): Fonts {
  // Hindi pages: the old-book face has no Devanagari, so it falls through to Tiro Devanagari.
  const deva = cssFont('--font-display', 'serif')
  return {
    book: cssFont('--font-book', `${deva}`),
    caps: cssFont('--font-book-sc', `${deva}`),
    deva,
  }
}

/** Greedy word wrap; the last allowed line gets an ellipsis if text remains. */
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (measure(next) <= maxWidth || !line) { line = next; continue }
    lines.push(line)
    line = words[i]
    if (lines.length === maxLines) {
      let last = lines[maxLines - 1]
      while (last.includes(' ') && measure(`${last}…`) > maxWidth) last = last.slice(0, last.lastIndexOf(' '))
      lines[maxLines - 1] = `${last}…`
      return lines
    }
  }
  if (line) lines.push(line)
  return lines
}

function ornament(ctx: CanvasRenderingContext2D, cx: number, y: number) {
  ctx.save()
  ctx.strokeStyle = GILT
  ctx.fillStyle = GILT
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(cx - 190, y); ctx.lineTo(cx - 40, y); ctx.moveTo(cx + 40, y); ctx.lineTo(cx + 190, y); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, y - 18); ctx.bezierCurveTo(cx + 13, y - 8, cx + 13, y + 8, cx, y + 18); ctx.bezierCurveTo(cx - 13, y + 8, cx - 13, y - 8, cx, y - 18)
  ctx.fill()
  ctx.beginPath(); ctx.arc(cx - 28, y, 4, 0, Math.PI * 2); ctx.arc(cx + 28, y, 4, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

export function drawShareCard(ctx: CanvasRenderingContext2D, d: ShareCardData, fonts: Fonts = resolveFonts()) {
  const W = CARD_W, H = CARD_H, cx = W / 2
  // Parchment with a darker edge.
  const bg = ctx.createRadialGradient(cx, H * 0.38, 80, cx, H * 0.5, H * 0.78)
  bg.addColorStop(0, '#f8eed6'); bg.addColorStop(0.62, '#efe0bd'); bg.addColorStop(1, '#d6bb85')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  // A double gilt rule, like an old frontispiece.
  ctx.strokeStyle = GILT
  ctx.lineWidth = 3; ctx.strokeRect(46, 46, W - 92, H - 92)
  ctx.lineWidth = 1.2; ctx.strokeRect(62, 62, W - 124, H - 124)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const maxW = W - 220
  let y = 168

  ctx.fillStyle = INK_SOFT
  ctx.font = `30px ${fonts.caps}`
  ctx.fillText(d.bookLatin.toUpperCase().split('').join(' '), cx, y)
  y += 56
  ctx.fillStyle = RUBRIC
  ctx.font = `40px ${fonts.caps}`
  ctx.fillText(d.heading, cx, y)
  y += 58
  ornament(ctx, cx, y)
  y += 82

  // The middle block is laid out twice: once to measure it, once to draw it centred
  // between the heading and the footer.
  const top = y
  const footerTop = H - 250
  const block = (draw: boolean, y0: number): number => {
    let yy = y0
    const text = (t: string, x: number, at: number) => { if (draw) ctx.fillText(t, x, at) }
    if (d.shloka) {
      ctx.fillStyle = RUBRIC
      ctx.font = `44px ${fonts.deva}`
      const lines = d.shloka.split('\n').flatMap((l) => wrapLines((s) => ctx.measureText(s).width, l, maxW, 3)).slice(0, 5)
      for (const l of lines) { text(l, cx, yy); yy += 70 }
      yy += 34
    } else if (d.verseMark) {
      ctx.fillStyle = RUBRIC
      ctx.font = `64px ${fonts.deva}`
      text(`॥ ${d.verseMark} ॥`, cx, yy + 10)
      yy += 120
    }
    ctx.fillStyle = INK
    ctx.font = `64px ${fonts.book}`
    for (const l of wrapLines((s) => ctx.measureText(s).width, d.title, maxW, 2)) { text(l, cx, yy); yy += 76 }
    yy += 18
    ctx.font = `italic 38px ${fonts.book}`
    for (const l of wrapLines((s) => ctx.measureText(s).width, d.teaching, maxW, d.shloka ? 4 : 6)) { text(l, cx, yy); yy += 56 }
    if (d.practice) {
      yy += 34
      ctx.fillStyle = RUBRIC
      ctx.font = `30px ${fonts.caps}`
      text('FOR TODAY', cx, yy)
      yy += 50
      ctx.fillStyle = INK
      ctx.font = `34px ${fonts.book}`
      for (const l of wrapLines((s) => ctx.measureText(s).width, d.practice, maxW, 3)) { text(l, cx, yy); yy += 50 }
    }
    return yy
  }
  const height = block(false, top) - top
  block(true, top + Math.max(0, (footerTop - top - height) / 2))

  // Footer: where it came from, and what it is. The AI label is never left off.
  ornament(ctx, cx, H - 200)
  ctx.fillStyle = INK
  ctx.font = `38px ${fonts.book}`
  ctx.fillText(`Kanha  ·  ${d.site}`, cx, H - 132)
  ctx.fillStyle = INK_SOFT
  ctx.font = `italic 26px ${fonts.book}`
  ctx.fillText('A reflection written by AI. Not God, not Krishna.', cx, H - 90)
}

/** Renders the card and hands it to the share sheet (or downloads it where sharing files isn't supported). */
export async function shareCard(d: ShareCardData, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const fonts = resolveFonts()
  try {
    await Promise.all([
      document.fonts?.load(`64px ${fonts.book}`, d.title),
      document.fonts?.load(`italic 38px ${fonts.book}`, d.teaching),
      document.fonts?.load(`30px ${fonts.caps}`, 'FOR TODAY'),
      d.shloka ? document.fonts?.load(`44px ${fonts.deva}`, d.shloka) : undefined,
    ])
  } catch { /* draw with whatever has loaded */ }
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  drawShareCard(ctx, d, fonts)
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('could not render the card')
  const file = new File([blob], fileName, { type: 'image/png' })
  const text = `${d.title} · ${d.bookLatin}${d.folio ? ` ${d.folio}` : ''}\nhttps://${d.site}`
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: d.title, text })
      return 'shared'
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
