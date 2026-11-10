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
import './zzz.css'
import './hsr.css'

/** Textos propios (no van en locales.ts para que quitar las skins no toque nada más). */
const TXT: Record<Lang, Record<string, string>> = {
  es: { title: 'Skin del sitio', none: 'Original', locked: 'Las skins son parte de WhenGacha Premium, un pequeño extra para quienes apoyan el proyecto 💛',
    support: 'Apoyar y desbloquear', finish: 'Terminar de activar Premium', have: 'Escribe el correo que usaste al apoyar y te mando un enlace para activar Premium aquí. Solo llega a correos de quienes apoyaron.',
    email: 'Tu correo', send: 'Enviar enlace', busy: 'Enviando…', sent: 'Si ese correo apoyó el proyecto, te llegará en unos minutos un enlace de un solo uso, válido 30 minutos (mira también en spam). Si no, no se envía nada.',
    active: 'Premium activo en este dispositivo 💛', logout: 'Cerrar sesión aquí', loginOk: '¡Listo! Premium activado en este dispositivo 💛',
    loginBad: 'Ese enlace caducó o ya se usó. Pide otro con tu correo.', invalid: 'Revisa el correo.',
    'too-many': 'Muchos intentos seguidos, espera unos minutos.', unavailable: 'Ahora mismo no se puede, prueba más tarde.',
    try: 'Vista previa', haveLink: '¿Ya apoyaste? Entra con tu correo →', back: '← Volver', loginTitle: 'Entrar a Premium' },
  en: { title: 'Site skin', none: 'Original', locked: 'Skins are part of WhenGacha Premium, a little extra for people who support the project 💛',
    support: 'Support and unlock', finish: 'Finish turning on Premium', have: "Enter the email you used to support and I will send you a link to turn on Premium here. It only goes to supporters' emails.",
    email: 'Your email', send: 'Send link', busy: 'Sending…', sent: 'If that email supported the project, a one-time link valid for 30 minutes will arrive in a few minutes (check spam too). Otherwise nothing is sent.',
    active: 'Premium is on for this device 💛', logout: 'Sign out here', loginOk: 'Done! Premium is on for this device 💛',
    loginBad: 'That link expired or was already used. Ask for a new one with your email.', invalid: 'Check the email.',
    'too-many': 'Too many tries in a row, wait a few minutes.', unavailable: "Can't do it right now, try again later.",
    try: 'Preview', haveLink: 'Already supported? Sign in with your email →', back: '← Back', loginTitle: 'Sign in to Premium' },
  zh: { title: '网站皮肤', none: '原版', locked: '皮肤属于 WhenGacha 高级版，是给支持者的小福利 💛',
    support: '支持并解锁', finish: '完成开启高级版', have: '输入支持时使用的邮箱，我会发给你在此设备开启高级版的链接。只会发给支持者的邮箱。',
    email: '你的邮箱', send: '发送链接', busy: '发送中…', sent: '如果该邮箱支持过本项目，几分钟内会收到一次性链接，30 分钟内有效（也请查看垃圾邮件）。否则不会发送任何内容。',
    active: '此设备已开启高级版 💛', logout: '在此设备退出', loginOk: '好了！此设备已开启高级版 💛',
    loginBad: '链接已过期或已使用，请用邮箱重新获取。', invalid: '请检查邮箱。',
    'too-many': '试太多次了，等几分钟再来。', unavailable: '现在不行，晚点再试试。',
    try: '预览', haveLink: '已经支持过？用邮箱登录 →', back: '← 返回', loginTitle: '登录高级版' },
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
  // Vista del menú: las skins, o "entrar con el correo" (aparte, para no llenar el menú de texto).
  const [view, setView] = useState<'skins' | 'login'>('skins')
  const [dialog, setDialog] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<ApiResult | 'busy' | null>(null)
  const box = useRef<HTMLDivElement>(null)
  // Posición del menú en pantalla, medida al abrirlo y fija mientras está abierto: cada skin tiene otra altura de cabecera, y con la
  // vista previa el menú saltaba de sitio al pasar el ratón de una fila a otra (10 nov 2026). En móvil manda el CSS (fijo bajo la cabecera).
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const toggle = () => setOpen(o => {
    const r = box.current?.getBoundingClientRect()
    setPos(!o && r && window.matchMedia('(min-width: 601px)').matches ? { top: r.bottom + 8, right: document.documentElement.clientWidth - r.right } : null)
    return !o
  })
  const pending = !supporter && !!pendingClaim()

  useEffect(() => { applySkin(active) }, [active])
  // La vista previa solo vive con el menú abierto: al cerrarlo (o en móvil, al tocar fuera) vuelve la vista de siempre.
  useEffect(() => { if (!open) { endPreview(); setView('skins') } }, [open])
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
      <button className="btn sm lang-btn" onClick={toggle} aria-haspopup="menu" aria-expanded={open} title={s.title} aria-label={s.title}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14.5 4.5l5 5-8.2 8.2a3 3 0 0 1-2.1.9H6.5v-2.7a3 3 0 0 1 .9-2.1z" /><path d="M12.5 6.5l5 5" /><path d="M4 21c1.5-.4 2.5-1.2 2.5-2.4" />
        </svg>
      </button>
      {open && (
        // La vista previa termina al salir del MENÚ, no de cada fila: si una skin cambia el tamaño de las filas, la fila se movía bajo el ratón,
        // la vista previa se quitaba, la fila volvía a su sitio y empezaba otra vez (parpadeo con ZZZ, 10 nov 2026). Ver también onMouseMove en las filas.
        <ul className="skin-panel" role="menu" aria-label={s.title} style={pos ? { position: 'fixed', top: pos.top, right: pos.right } : undefined} onMouseLeave={() => { if (!supporter) endPreview() }}>
          <li className="skin-title">{view === 'login' ? s.loginTitle : s.title}</li>
          {notice && <li className={`skin-msg ${notice === 'login-ok' ? 'good' : 'bad'}`} role="status">{notice === 'login-ok' ? s.loginOk : s.loginBad}</li>}
          {view === 'login' ? (
            <li className="skin-unlock skin-login">
              <button className="linkbtn skin-back" onClick={() => setView('skins')}>{s.back}</button>
              <p>{s.have}</p>
              <form onSubmit={sendLink}>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); if (status !== 'busy') setStatus(null) }} placeholder={s.email}
                  aria-label={s.email} autoComplete="email" maxLength={254} autoFocus />
                <button className="btn sm" disabled={!email.trim() || status === 'busy'}>{status === 'busy' ? s.busy : s.send}</button>
              </form>
              {status === 'ok' && <small className="skin-msg good" role="status">{s.sent}</small>}
              {status && status !== 'busy' && status !== 'ok' && <small className="skin-msg bad" role="alert">{s[status] ?? s.unavailable}</small>}
            </li>
          ) : <>
          <li role="none">
            <button role="menuitemradio" aria-checked={!skin} className={!skin ? 'on' : ''} onClick={() => pick(null)} onMouseMove={() => { if (!supporter && preview) endPreview() }}>
              <img src="/logo.webp" alt="" width="22" height="22" /><span>{s.none}</span>{!skin && <i>✓</i>}
            </button>
          </li>
          {SKINS.map(k => (
            <li key={k.id} role="none">
              <button role="menuitemradio" aria-checked={skin === k.id} aria-disabled={!supporter} className={`${skin === k.id ? 'on' : ''} ${supporter ? '' : 'locked'}`}
                // Sin Premium: vista previa al pasar el ratón (o el foco del teclado) por la fila; en móvil, al tocarla. Se quita al salir del menú.
                // onMouseMove y no onMouseEnter: si la skin desplaza las filas, una fila "entra" bajo el ratón sin que se mueva, y eso no debe
                // cambiar la vista previa (provocaba un vaivén entre dos filas).
                onMouseMove={() => { if (!supporter && preview !== k.id) startPreview(k.id) }}
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
              <button className="linkbtn skin-have" onClick={() => setView('login')}>{s.haveLink}</button>
            </li>
          )}
          </>}
        </ul>
      )}
      {dialog && <SupportDialog donateUrl={donateUrl} onClose={() => setDialog(false)} />}
      {live && <LiveWallpaper key={active} live={live} />}
    </div>
  )
}
