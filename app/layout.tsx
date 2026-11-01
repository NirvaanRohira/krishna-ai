import type { Metadata, Viewport } from 'next'
import { Tiro_Devanagari_Hindi, Mukta, IM_Fell_English, IM_Fell_English_SC } from 'next/font/google'
import './globals.css'

// Both families cover Latin AND Devanagari, so Hindi replies get real typography rather
// than a system fallback. Self-hosted by next/font at build: no runtime call to Google.
const display = Tiro_Devanagari_Hindi({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin', 'devanagari'],
  variable: '--font-display',
  display: 'swap',
})

// The scripture book's typeface: a 17th-century English roman, for the old-book feel.
const book = IM_Fell_English({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-book', display: 'swap' })
const bookCaps = IM_Fell_English_SC({ weight: '400', subsets: ['latin'], variable: '--font-book-sc', display: 'swap' })

const body = Mukta({
  weight: ['300', '400', '500', '600'],
  subsets: ['latin', 'devanagari'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Kanha', template: '%s · Kanha' },
  description: 'Reflect on your life with the Bhagavad Gita. An AI guide, shown in Krishna’s likeness — not God, not a guru.',
}

export const viewport: Viewport = {
  themeColor: '#fbf6ec',
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const THEME_SCRIPT = `try{var t=localStorage.getItem('kanha.theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t}}catch(e){}`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Light ("Vrindavan dawn") is the default; a saved choice is applied before first paint
    // so there is no flash. suppressHydrationWarning: the script may change data-theme.
    <html lang="en" data-theme="light" className={`${display.variable} ${body.variable} ${book.variable} ${bookCaps.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
