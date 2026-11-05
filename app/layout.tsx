import type { Metadata, Viewport } from 'next'
import { Tiro_Devanagari_Hindi, Mukta, IM_Fell_English, IM_Fell_English_SC } from 'next/font/google'
import './globals.css'
import { PwaSetup } from '@/components/PwaSetup'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { LangProvider } from '@/components/LangProvider'
import { getLang } from '@/lib/i18n/server'

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
// Not preloaded: the book only appears further down a page or after a reply, so these
// shouldn't compete with the first screen (hero image, title, body text) on slow networks.
const book = IM_Fell_English({ weight: '400', style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-book', display: 'swap', preload: false })
const bookCaps = IM_Fell_English_SC({ weight: '400', subsets: ['latin'], variable: '--font-book-sc', display: 'swap', preload: false })

const body = Mukta({
  weight: ['400', '500', '600'],  // 300 was never used
  // `subsets` only decides what is *preloaded*: the Devanagari faces are still declared and
  // download the moment Hindi text appears. Preloading 3 weights × 2 scripts competed with
  // the first screen on slow networks.
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Kanha', template: '%s · Kanha' },
  applicationName: 'Kanha',
  appleWebApp: { capable: true, title: 'Kanha', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The interface language comes from the saved choice (cookie) or the browser's language,
  // so the very first paint is already in the right language.
  const lang = await getLang()
  return (
    // Light ("Vrindavan dawn") is the default; a saved choice is applied before first paint
    // so there is no flash. suppressHydrationWarning: the script may change data-theme.
    <html lang={lang} data-theme="light" className={`${display.variable} ${body.variable} ${book.variable} ${bookCaps.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <LangProvider lang={lang}>{children}</LangProvider>
        <PwaSetup />
        {/* Real-user speed (Core Web Vitals) from people's own phones; no personal data, no cookies. */}
        <SpeedInsights />
      </body>
    </html>
  )
}
