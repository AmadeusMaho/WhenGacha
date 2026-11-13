import { useEffect, useRef, useState } from 'react'
import { CATALOG } from '../catalog'
import { useLang, type Lang } from '../i18n'
import LiveWallpaper from './LiveWallpaper'
import { useLiveWithFeed } from './liveFeed'
import { clearNotice, loginWithCode, logout, requestLink, useNotice, type ApiResult } from './premium'
import { SKINS, applySkin, endPreview, setSkin, startPreview, usePreview, useSkin, useSupporter } from './skins'
import SupportDialog from './SupportDialog'
import './skins.css'
import './wuwa.css'
import './genshin.css'
import './zzz.css'
import './hsr.css'
import './nikke.css'
import './uma.css'
import './arknights.css'
import './akTilt'

/** Textos propios (no van en locales.ts para que quitar las skins no toque nada más). */
const TXT: Record<Lang, Record<string, string>> = {
  es: { title: 'Skin del sitio', none: 'Original', locked: 'Las skins vienen con WhenGacha Premium. Apoyas una vez y son tuyas para siempre 💛',
    support: 'Apoyar y desbloquear', have: 'Escribe el correo que usaste al apoyar y te mando un enlace para activar Premium aquí. Solo llega a correos de quienes apoyaron.',
    email: 'Tu correo', send: 'Enviar enlace', busy: 'Enviando…', sent: 'Si ese correo apoyó el proyecto, te llegará en unos minutos un enlace de un solo uso, válido 30 minutos (mira también en spam). Si no, no se envía nada.',
    active: 'Premium activo en este dispositivo 💛', logout: 'Cerrar sesión aquí', loginOk: '¡Listo! Premium activado en este dispositivo 💛',
    loginBad: 'Ese enlace caducó o ya se usó. Pide otro con tu correo.', invalid: 'Revisa el correo.',
    'too-many': 'Muchos intentos seguidos, espera unos minutos.', unavailable: 'Ahora mismo no se puede, prueba más tarde.',
    try: 'Vista previa', haveLink: '¿Ya apoyaste? Entra con tu correo →', back: '← Volver', loginTitle: 'Entrar a Premium',
    codeHint: '¿El correo se abrió dentro de Gmail u otra app? Escribe tu correo arriba y aquí el código de 6 cifras que viene en él.', code: 'Código', enter: 'Entrar', codeBad: 'Código incorrecto o caducado. Pide otro correo.' },
  en: { title: 'Site skin', none: 'Original', locked: "Skins come with WhenGacha Premium. Support once and they're yours forever 💛",
    support: 'Support and unlock', have: "Enter the email you used to support and I will send you a link to turn on Premium here. It only goes to supporters' emails.",
    email: 'Your email', send: 'Send link', busy: 'Sending…', sent: 'If that email supported the project, a one-time link valid for 30 minutes will arrive in a few minutes (check spam too). Otherwise nothing is sent.',
    active: 'Premium is on for this device 💛', logout: 'Sign out here', loginOk: 'Done! Premium is on for this device 💛',
    loginBad: 'That link expired or was already used. Ask for a new one with your email.', invalid: 'Check the email.',
    'too-many': 'Too many tries in a row, wait a few minutes.', unavailable: "Can't do it right now, try again later.",
    try: 'Preview', haveLink: 'Already supported? Sign in with your email →', back: '← Back', loginTitle: 'Sign in to Premium',
    codeHint: 'Did the email open inside Gmail or another app? Enter your email above and the 6-digit code from it here.', code: 'Code', enter: 'Sign in', codeBad: 'Wrong or expired code. Ask for a new email.' },
  zh: { title: '网站皮肤', none: '原版', locked: '皮肤包含在 WhenGacha 高级版中。支持一次，永久拥有 💛',
    support: '支持并解锁', have: '输入支持时使用的邮箱，我会发给你在此设备开启高级版的链接。只会发给支持者的邮箱。',
    email: '你的邮箱', send: '发送链接', busy: '发送中…', sent: '如果该邮箱支持过本项目，几分钟内会收到一次性链接，30 分钟内有效（也请查看垃圾邮件）。否则不会发送任何内容。',
    active: '此设备已开启高级版 💛', logout: '在此设备退出', loginOk: '好了！此设备已开启高级版 💛',
    loginBad: '链接已过期或已使用，请用邮箱重新获取。', invalid: '请检查邮箱。',
    'too-many': '试太多次了，等几分钟再来。', unavailable: '现在不行，晚点再试试。',
    try: '预览', haveLink: '已经支持过？用邮箱登录 →', back: '← 返回', loginTitle: '登录高级版',
    codeHint: '邮件在 Gmail 或其他应用内打开了？在上面输入你的邮箱，在这里输入邮件中的 6 位验证码。', code: '验证码', enter: '登录', codeBad: '验证码错误或已过期，请重新获取邮件。' },
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
  // Fondos de la skin + el de la versión actual del juego (liveFeed.ts), solo en la línea de tiempo (o en todas las pestañas si la
  // skin lo pide con `liveAllTabs`; ahí el mismo vídeo sigue al cambiar de pestaña y el siguiente sale en la próxima visita).
  const def = SKINS.find(k => k.id === active)
  const live = useLiveWithFeed(active, timeline || def?.liveAllTabs ? def?.live : undefined)
  const [open, setOpen] = useState(false)
  // Vista del menú: las skins, o "entrar con el correo" (aparte, para no llenar el menú de texto).
  const [view, setView] = useState<'skins' | 'login'>('skins')
  const [dialog, setDialog] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<ApiResult | 'busy' | null>(null)
  // Código de 6 cifras del correo (si el enlace se abrió en el navegador interno de Gmail u otra app).
  const [code, setCode] = useState('')
  const [codeStatus, setCodeStatus] = useState<ApiResult | 'busy' | null>(null)
  const box = useRef<HTMLDivElement>(null)
  // Posición del menú en pantalla, medida al abrirlo y fija mientras está abierto: cada skin tiene otra altura de cabecera, y con la
  // vista previa el menú saltaba de sitio al pasar el ratón de una fila a otra (10 nov 2026). En móvil manda el CSS (fijo bajo la cabecera).
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const toggle = () => setOpen(o => {
    const r = box.current?.getBoundingClientRect()
    setPos(!o && r && window.matchMedia('(min-width: 601px)').matches ? { top: r.bottom + 8, right: document.documentElement.clientWidth - r.right } : null)
    return !o
  })

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
  const codeOk = code.replace(/\D/g, '').length === 6
  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !codeOk || codeStatus === 'busy') return
    setCodeStatus('busy')
    const r = await loginWithCode(email, code)
    if (r === 'ok') { setCode(''); setCodeStatus(null); setView('skins') } else setCodeStatus(r)
  }

  return (
    <div className="skin" ref={box}>
      <button className="btn sm lang-btn" onClick={toggle} aria-haspopup="menu" aria-expanded={open} title={s.title} aria-label={s.title}>
        {/* Paleta de acuarela (12 nov 2026): contorno con el hueco del pulgar y cuatro pastillas de color con el centro aguado; en el color del botón. */}
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3.2c-5.1 0-9 3.6-9 8.3 0 4.4 3.6 8.3 8.2 8.3 1.4 0 2.1-.8 2.1-1.8 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.9-1.8h2.3c2.9 0 4.6-1.9 4.6-4.4 0-3.3-4-5.9-9-5.9z" />
          {[[7.6, 11.2], [9.4, 7.3], [14, 6.6], [17.1, 9.6]].map(([cx, cy]) => (
            <g key={cx}><circle cx={cx} cy={cy} r="1.75" fill="currentColor" fillOpacity=".35" /><circle cx={cx} cy={cy} r=".6" fill="currentColor" stroke="none" /></g>
          ))}
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
              <p className="skin-code-hint">{s.codeHint}</p>
              <form onSubmit={sendCode}>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} value={code}
                  onChange={e => { setCode(e.target.value.replace(/[^\d ]/g, '')); if (codeStatus !== 'busy') setCodeStatus(null) }}
                  placeholder={s.code} aria-label={s.code} className="skin-code" />
                <button className="btn sm" disabled={!email.trim() || !codeOk || codeStatus === 'busy'}>{codeStatus === 'busy' ? s.busy : s.enter}</button>
              </form>
              {codeStatus && codeStatus !== 'busy' && <small className="skin-msg bad" role="alert">{codeStatus === 'invalid' ? s.codeBad : s[codeStatus] ?? s.unavailable}</small>}
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
              <button className="btn sm primary support-open" onClick={() => { setDialog(true); setOpen(false) }}>{s.support}</button>
              <button className="linkbtn skin-have" onClick={() => setView('login')}>{s.haveLink}</button>
            </li>
          )}
          </>}
        </ul>
      )}
      {dialog && <SupportDialog donateUrl={donateUrl} onClose={() => setDialog(false)}
        onLogin={() => { setDialog(false); toggle(); setView('login') }} />}
      {live && active && <LiveWallpaper key={active} skin={active} live={live} />}
    </div>
  )
}
