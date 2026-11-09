import { useEffect, useRef, useState } from 'react'
import { CATALOG } from '../catalog'
import { useLang, type Lang } from '../i18n'
import LiveWallpaper from './LiveWallpaper'
import { SKINS, applySkin, setSkin, unlock, useSkin, useSupporter, type UnlockResult } from './skins'
import './skins.css'
import './wuwa.css'

/** Textos propios (no van en locales.ts para que quitar las skins no toque nada más). */
const TXT: Record<Lang, Record<string, string>> = {
  es: { title: 'Skin del sitio', none: 'Original', locked: 'Las skins son un pequeño extra para quienes apoyan WhenGacha 💛',
    how: 'Si donas, te mando tu código al correo que usaste en PayPal.', donate: 'Apoyar el proyecto', code: 'Código de apoyo',
    unlock: 'Desbloquear', busy: 'Revisando…', ok: '¡Listo! Gracias por apoyar 💛', invalid: 'Ese código no funciona, revisa que esté bien copiado.',
    'too-many': 'Muchos intentos seguidos, espera unos minutos.', unavailable: 'Ahora mismo no se puede revisar, prueba más tarde.' },
  en: { title: 'Site skin', none: 'Original', locked: 'Skins are a little extra for people who support WhenGacha 💛',
    how: "If you donate, I'll send your code to the email you used on PayPal.", donate: 'Support the project', code: 'Supporter code',
    unlock: 'Unlock', busy: 'Checking…', ok: 'Done! Thanks for the support 💛', invalid: "That code doesn't work, check that you copied it right.",
    'too-many': 'Too many tries in a row, wait a few minutes.', unavailable: "Can't check it right now, try again later." },
  zh: { title: '网站皮肤', none: '原版', locked: '皮肤是给支持 WhenGacha 的朋友的小福利 💛',
    how: '捐赠后，我会把代码发到你 PayPal 用的邮箱。', donate: '支持本项目', code: '支持者代码',
    unlock: '解锁', busy: '验证中…', ok: '好了！谢谢支持 💛', invalid: '这个代码用不了，检查一下有没有复制错。',
    'too-many': '试太多次了，等几分钟再来。', unavailable: '现在验证不了，晚点再试试。' },
}

/**
 * Botón "pincel" de la cabecera con la lista de skins. Es lo único que App.tsx monta de las skins.
 * `timeline`: si se está viendo la línea de tiempo (ahí va el fondo animado de la skin, si tiene).
 * `donateUrl`: enlace de donaciones, para quien aún no ha desbloqueado las skins.
 */
export default function SkinPicker({ timeline = false, donateUrl }: { timeline?: boolean; donateUrl?: string }) {
  const lang = useLang()
  const s = TXT[lang] ?? TXT.es
  const skin = useSkin()
  const supporter = useSupporter()
  const live = timeline ? SKINS.find(k => k.id === skin)?.live : undefined
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<UnlockResult | 'busy' | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => { applySkin(skin) }, [skin])

  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc) }
  }, [open])

  const pick = (id: string | null) => { setSkin(id); setOpen(false) }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || status === 'busy') return
    setStatus('busy')
    setStatus(await unlock(code))
  }

  return (
    <div className="skin" ref={box}>
      <button className="btn sm lang-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} title={s.title} aria-label={s.title}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14.5 4.5l5 5-8.2 8.2a3 3 0 0 1-2.1.9H6.5v-2.7a3 3 0 0 1 .9-2.1z" /><path d="M12.5 6.5l5 5" /><path d="M4 21c1.5-.4 2.5-1.2 2.5-2.4" />
        </svg>
      </button>
      {open && (
        <ul className="skin-panel" role="menu" aria-label={s.title}>
          <li className="skin-title">{s.title}</li>
          <li role="none">
            <button role="menuitemradio" aria-checked={!skin} className={!skin ? 'on' : ''} onClick={() => pick(null)}>
              <img src="/logo.webp" alt="" width="22" height="22" /><span>{s.none}</span>{!skin && <i>✓</i>}
            </button>
          </li>
          {SKINS.map(k => (
            <li key={k.id} role="none">
              <button role="menuitemradio" aria-checked={skin === k.id} aria-disabled={!supporter} className={`${skin === k.id ? 'on' : ''} ${supporter ? '' : 'locked'}`}
                onClick={() => supporter && pick(k.id)}>
                <img src={CATALOG.find(g => g.id === k.game)?.logo} alt="" width="22" height="22" referrerPolicy="no-referrer" /><span>{k.name}</span>
                {skin === k.id ? <i>✓</i> : !supporter && <i className="skin-lock" aria-hidden>🔒</i>}
              </button>
            </li>
          ))}
          {!supporter && (
            <li className="skin-unlock">
              <p>{s.locked} {s.how}</p>
              {donateUrl && <a className="btn sm donate" href={donateUrl} target="_blank" rel="noopener noreferrer">{s.donate}</a>}
              <form onSubmit={submit}>
                <input value={code} onChange={e => { setCode(e.target.value); if (status !== 'busy') setStatus(null) }} placeholder="WG-XXXXXXXXXX-XXXXXXXXXX"
                  aria-label={s.code} autoComplete="off" spellCheck={false} maxLength={40} />
                <button className="btn sm primary" disabled={!code.trim() || status === 'busy'}>{status === 'busy' ? s.busy : s.unlock}</button>
              </form>
              {status && status !== 'busy' && status !== 'ok' && <small className="skin-msg bad" role="alert">{s[status]}</small>}
            </li>
          )}
          {supporter && status === 'ok' && <li className="skin-msg good" role="status">{s.ok}</li>}
        </ul>
      )}
      {live && <LiveWallpaper key={skin} live={live} />}
    </div>
  )
}
