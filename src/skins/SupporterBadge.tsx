import { useLang, type Lang } from '../i18n'
import { useSupporter } from './skins'

const TXT: Record<Lang, { label: string; tip: string }> = {
  es: { label: 'Premium', tip: 'Gracias por apoyar WhenGacha 💛' },
  en: { label: 'Premium', tip: 'Thanks for supporting WhenGacha 💛' },
  zh: { label: '高级版', tip: '感谢支持 WhenGacha 💛' },
}

/** Insignia "Premium" junto al nombre de la web, solo para quien apoya el proyecto (mismo desbloqueo que las skins). */
export default function SupporterBadge() {
  const lang = useLang()
  const supporter = useSupporter()
  if (!supporter) return null
  const s = TXT[lang] ?? TXT.es
  return <span className="premium-badge" title={s.tip}>{s.label}</span>
}
