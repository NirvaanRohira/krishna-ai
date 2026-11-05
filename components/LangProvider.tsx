'use client'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LANG_COOKIE, translator, type Lang, type TFn } from '@/lib/i18n'

type Ctx = { lang: Lang; t: TFn; setLang: (l: Lang) => void }

// Outside the provider (tests, isolated renders) everything reads in English.
const LangContext = createContext<Ctx>({ lang: 'en', t: translator('en'), setLang: () => {} })

export function LangProvider({ lang: initial, children }: { lang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial)
  const router = useRouter()

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    // A year; read by the server on the next request so server-rendered pages match.
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
    document.documentElement.lang = l
    router.refresh()
  }, [router])

  const value = useMemo(() => ({ lang, t: translator(lang), setLang }), [lang, setLang])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}
