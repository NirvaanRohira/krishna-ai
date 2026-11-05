'use client'
import { useLang } from '@/components/LangProvider'

export function DisclaimerBadge() {
  const { t } = useLang()
  return (
    <p className="disclaimer-badge" role="note">
      {t('common.disclaimer_badge')}
    </p>
  )
}
