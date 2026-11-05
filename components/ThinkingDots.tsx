'use client'
import { useLang } from '@/components/LangProvider'

export function ThinkingDots() {
  const { t } = useLang()
  return (
    <span className="thinking-dots" data-thinking="true" aria-label={t('chat.reflecting')}>
      <span /><span /><span />
    </span>
  )
}
