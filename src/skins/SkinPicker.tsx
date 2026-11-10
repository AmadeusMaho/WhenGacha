import { useEffect, useRef, useState } from 'react'
import { CATALOG } from '../catalog'
import { useLang, type Lang } from '../i18n'
import LiveWallpaper from './LiveWallpaper'
import { clearNotice, logout, pendingClaim, requestLink, useNotice, type ApiResult } from './premium'
import { SKINS, applySkin, endPreview, setSkin, startPreview, usePreview, useSkin, useSupporter } from './skins'
import SupportDialog from './SupportDialog'
import './skins.css'
import './wuwa.css'
import './genshin.css'

/** Textos propios (no van en locales.ts para que quitar las skins no toque nada más). */
const TXT: Record<Lang, Record<string, string>> = {
  es: { title: 'Skin del sitio', none: 'Original', locked: 'Las skins son parte de WhenGacha Premium, un pequeño extra para quienes apoyan el proyecto 💛',
    support: 'Apoyar y desbloquear', finish: 'Terminar de activar Premium', have: '¿Ya apoyaste? Escribe tu correo y te mando un enlace para entrar:',
    email: 'Tu correo', send: 'Enviar enlace', busy: 'Enviando…', sent: 'Si ese correo tiene Premium, te llegará un enlace en unos minutos (mira también en spam).',
    active: 'Premium activo en este dispositivo 💛', logout: 'Cerrar sesión aquí', loginOk: '¡Listo! Premium activado en este dispositivo 💛',
    loginBad: 'Ese enlace caducó o ya se usó. Pide otro con tu correo.', invalid: 'Revisa el correo.',
    'too-many': 'Muchos intentos seguidos, espera unos minutos.', unavailable: 'Ahora mismo no se puede, prueba más tarde.',
    try: 'Vista previa' },
  en: { title: 'Site skin', none: 'Original', locked: 'Skins are part of WhenGacha Premium, a little extra for people who support the project 💛',
    support: 'Support and unlock', finish: 'Finish turning on Premium', have: 'Already supported? Enter your email and I will send you a sign-in link:',
    email: 'Your email', send: 'Send link', busy: 'Sending…', sent: 'If that email has Premium, a link will arrive in a few minutes (check spam too).',
    active: 'Premium is on for this device 💛', logout: 'Sign out here', loginOk: 'Done! Premium is on for this device 💛',
    loginBad: 'That link expired or was already used. Ask for a new one with your email.', invalid: 'Check the email.',
    'too-many': 'Too many tries in a row, wait a few minutes.', unavailable: "Can't do it right now, try again later.",
    try: 'Preview' },
  zh: { title: '网站皮肤', none: '原版', locked: '皮肤属于 WhenGacha 高级版，是给支持者的小福利 💛',
    support: '支持并解锁', finish: '完成开启高级版', have: '已经支持过？输入邮箱，我会发给你登录链接：',
    email: '你的邮箱', send: '发送链接', busy: '发送中…', sent: '如果该邮箱拥有高级版，几分钟内会收到链接（也请查看垃圾邮件）。',
    active: '此设备已开启高级版 💛', logout: '在此设备退出', loginOk: '好了！此设备已开启高级版 💛',
    loginBad: '链接已过期或已使用，请用邮箱重新获取。', invalid: '请检查邮箱。',
    'too-many': '试太多次了，等几分钟再来。', unavailable: '现在不行，晚点再试试。',
    try: '预览' },
}

/**
 * Botón "pincel" de la cabecera: skins de WhenGacha Premium, apoyo y acceso por correo. Es lo único que App.tsx monta de las skins.
 * `timeline`: si se está viendo la línea de tiempo (ahí va el fondo animado de la skin, si tiene).
 * `donateUrl`: donación sin Premium, por si el apoyo con Premium aún no está configurado en el servidor.
 */
export default function SkinPicker({ timeline = false, donateUrl }: { timeline?: boolean; donateUrl?: string }) {
  const lang = useLang()
  const s = TXT[lang] ?? TXT.es
  const skin = useSkin()
  const supporter = useSupporter()
  const notice = useNotice()
  const preview = usePreview()
  // Lo que se ve: la vista previa (sin Premium) o la skin elegida.
  const active = preview ?? skin
  const live = timeline ? SKINS.find(k => k.id === active)?.live : undefined
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<ApiResult | 'busy' | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const pending = !supporter && !!pendingClaim()

  useEffect(() => { applySkin(active) }, [active])
  // La vista previa solo vive con el menú abierto: al cerrarlo (o en móvil, al tocar fuera) vuelve la vista de siempre.
  useEffect(() => { if (!open) endPreview() }, [open])
  // Al volver desde el enlace del correo, se abre el menú con el resultado.
  useEffect(() => { if (notice) setOpen(true) }, [notice])

  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); clearNotice() } }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); clearNotice() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc) }
  }, [open])

  const pick = (id: string | null) => { setSkin(id); setOpen(false) }
  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || status === 'busy') return
    setStatus('busy')
    setStatus(await requestLink(email, lang))
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
          {notice && <li className={`skin-msg ${notice === 'login-ok' ? 'good' : 'bad'}`} role="status">{notice === 'login-ok' ? s.loginOk : s.loginBad}</li>}
          <li role="none">
            <button role="menuitemradio" aria-checked={!skin} className={!skin ? 'on' : ''} onClick={() => pick(null)}>
              <img src="/logo.webp" alt="" width="22" height="22" /><span>{s.none}</span>{!skin && <i>✓</i>}
            </button>
          </li>
          {SKINS.map(k => (
            <li key={k.id} role="none">
              <button role="menuitemradio" aria-checked={skin === k.id} aria-disabled={!supporter} className={`${skin === k.id ? 'on' : ''} ${supporter ? '' : 'locked'}`}
                // Sin Premium: vista previa mientras el ratón (o el foco del teclado) está sobre la fila; en móvil, al tocarla.
                onMouseEnter={() => { if (!supporter) startPreview(k.id) }} onMouseLeave={() => { if (!supporter) endPreview() }}
                onFocus={() => { if (!supporter) startPreview(k.id) }} onBlur={() => { if (!supporter) endPreview() }}
                onClick={() => { if (supporter) pick(k.id); else startPreview(k.id) }}>
                <img src={CATALOG.find(g => g.id === k.game)?.logo} alt="" width="22" height="22" referrerPolicy="no-referrer" /><span>{k.name}</span>
                {skin === k.id ? <i>✓</i> : !supporter && <><small className="skin-try">{s.try}</small><i className="skin-lock" aria-hidden>🔒</i></>}
              </button>
            </li>
          ))}
          {supporter ? (
            <li className="skin-unlock skin-account">
              <p>{s.active}</p>
              <button className="linkbtn" onClick={() => { logout(); setStatus(null) }}>{s.logout}</button>
            </li>
          ) : (
            <li className="skin-unlock">
              <p>{s.locked}</p>
              <button className="btn sm primary support-open" onClick={() => { setDialog(true); setOpen(false) }}>{pending ? s.finish : s.support}</button>
              <p>{s.have}</p>
              <form onSubmit={sendLink}>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); if (status !== 'busy') setStatus(null) }} placeholder={s.email}
                  aria-label={s.email} autoComplete="email" maxLength={254} />
                <button className="btn sm" disabled={!email.trim() || status === 'busy'}>{status === 'busy' ? s.busy : s.send}</button>
              </form>
              {status === 'ok' && <small className="skin-msg good" role="status">{s.sent}</small>}
              {status && status !== 'busy' && status !== 'ok' && <small className="skin-msg bad" role="alert">{s[status] ?? s.unavailable}</small>}
            </li>
          )}
        </ul>
      )}
      {dialog && <SupportDialog donateUrl={donateUrl} onClose={() => setDialog(false)} />}
      {live && <LiveWallpaper key={active} live={live} />}
    </div>
  )
}
