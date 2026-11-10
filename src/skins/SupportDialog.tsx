import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang, type Lang } from '../i18n'
import { capture, claim, createOrder, pendingClaim, supportConfig, type ApiResult, type Claim, type SupportConfig } from './premium'

/**
 * Ventana de apoyo de WhenGacha Premium: importe → botón de PayPal (su SDK, con el id público de la aplicación) → correo → listo.
 * El pedido lo crea y lo cobra el servidor (server/supporter.mjs); aquí solo se muestra el botón y se pasa el resultado.
 */
const TXT: Record<Lang, Record<string, string>> = {
  es: { title: 'Apoyar WhenGacha', intro: 'Elige cuánto quieres aportar. Con cualquier apoyo desde {min} tienes Premium: las skins y la insignia.',
    custom: 'Otro importe', pay: 'Paga con PayPal:', sandbox: 'Modo de pruebas de PayPal: no se cobra dinero real.',
    loading: 'Cargando PayPal…', emailTitle: '¡Gracias! 💛 Último paso', emailIntro: '¿A qué correo te mandamos tu acceso? Con él entras desde otros dispositivos.',
    email: 'Tu correo', confirm: 'Activar Premium', busy: 'Un momento…', doneTitle: '¡Listo, ya tienes Premium! 💛',
    done: 'Ya está activo en este dispositivo. Te mandamos un correo a {email} para entrar desde otros.', doneNoMail: 'Ya está activo en este dispositivo. El correo no salió, pero puedes pedir el enlace más tarde desde el pincel.',
    close: 'Cerrar', off: 'El apoyo con Premium todavía no está activo.', donate: 'Donar igualmente',
    invalid: 'Revisa el correo.', 'too-many': 'Muchos intentos seguidos, espera unos minutos.', unavailable: 'Algo falló al hablar con el servidor, prueba de nuevo.',
    used: 'Ese pago ya se usó para activar Premium.', payment: 'PayPal no confirmó el pago. No se ha activado nada.' },
  en: { title: 'Support WhenGacha', intro: 'Choose how much you want to give. Any support from {min} gets you Premium: the skins and the badge.',
    custom: 'Other amount', pay: 'Pay with PayPal:', sandbox: 'PayPal test mode: no real money is charged.',
    loading: 'Loading PayPal…', emailTitle: 'Thank you! 💛 One last step', emailIntro: 'Which email should we send your access to? You can use it to sign in on other devices.',
    email: 'Your email', confirm: 'Turn on Premium', busy: 'One moment…', doneTitle: "Done, you've got Premium! 💛",
    done: "It's on for this device. We emailed {email} so you can sign in on others.", doneNoMail: "It's on for this device. The email didn't go out, but you can ask for the link later from the brush menu.",
    close: 'Close', off: "Premium support isn't available yet.", donate: 'Donate anyway',
    invalid: 'Check the email.', 'too-many': 'Too many tries in a row, wait a few minutes.', unavailable: 'Something went wrong talking to the server, try again.',
    used: 'That payment was already used to turn on Premium.', payment: "PayPal didn't confirm the payment. Nothing was turned on." },
  zh: { title: '支持 WhenGacha', intro: '选择你想支持的金额。支持 {min} 起即可获得高级版：皮肤和徽章。',
    custom: '其他金额', pay: '使用 PayPal 支付：', sandbox: 'PayPal 测试模式：不会扣除真实款项。',
    loading: '正在加载 PayPal…', emailTitle: '谢谢！💛 最后一步', emailIntro: '把访问链接发到哪个邮箱？之后可以用它在其他设备登录。',
    email: '你的邮箱', confirm: '开启高级版', busy: '请稍候…', doneTitle: '好了，你已拥有高级版！💛',
    done: '此设备已开启。我们已发送邮件到 {email}，方便你在其他设备登录。', doneNoMail: '此设备已开启。邮件没有发出，你可以稍后在画笔菜单中重新获取链接。',
    close: '关闭', off: '高级版支持功能尚未开放。', donate: '仍然捐赠',
    invalid: '请检查邮箱。', 'too-many': '试太多次了，等几分钟再来。', unavailable: '与服务器通信失败，请重试。',
    used: '这笔付款已经用于开启高级版。', payment: 'PayPal 未确认付款，未开启任何功能。' },
}

interface PayPalButtons { render: (el: HTMLElement) => Promise<void>; close: () => Promise<void> }
interface PayPalSdk { Buttons: (o: Record<string, unknown>) => PayPalButtons }

let sdk: Promise<PayPalSdk> | null = null
function loadSdk(clientId: string, currency: string): Promise<PayPalSdk> {
  sdk ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://www.paypal.com/sdk/js?${new URLSearchParams({ 'client-id': clientId, currency, intent: 'capture', components: 'buttons' })}`
    s.onload = () => { const p = (window as unknown as { paypal?: PayPalSdk }).paypal; if (p) resolve(p); else reject(new Error('paypal')) }
    s.onerror = () => { sdk = null; reject(new Error('paypal')) }
    document.head.appendChild(s)
  })
  return sdk
}

const PRESETS = [3, 5, 10]

export default function SupportDialog({ onClose, donateUrl }: { onClose: () => void; donateUrl?: string }) {
  const lang = useLang()
  const s = TXT[lang] ?? TXT.es
  const [cfg, setCfg] = useState<SupportConfig | null | undefined>(undefined)
  const [amount, setAmount] = useState(5)
  const [pending, setPending] = useState<Claim | null>(() => pendingClaim())
  const [email, setEmail] = useState(() => pendingClaim()?.email ?? '')
  const [status, setStatus] = useState<ApiResult | 'busy' | 'sdk' | null>(null)
  const [done, setDone] = useState<{ mailed: boolean } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const money = (n: number) => new Intl.NumberFormat(lang, { style: 'currency', currency: cfg?.currency ?? 'USD', maximumFractionDigits: 2 }).format(n)

  useEffect(() => { supportConfig().then(c => { setCfg(c); if (c && amount < c.min) setAmount(Math.max(c.min, PRESETS[0])) }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  // Botón de PayPal: se vuelve a dibujar al cambiar el importe (el pedido se crea con el importe del momento).
  useEffect(() => {
    if (!cfg?.enabled || pending || done || !box.current) return
    let buttons: PayPalButtons | null = null
    let cancelled = false
    const el = box.current
    loadSdk(cfg.paypalClientId, cfg.currency).then(paypal => {
      if (cancelled) return
      buttons = paypal.Buttons({
        style: { layout: 'vertical', shape: 'pill', label: 'pay', height: 40 },
        createOrder: () => createOrder(amount),
        onApprove: async (data: { orderID: string }) => {
          setStatus('busy')
          try { const c = await capture(data.orderID); setPending(c); setEmail(c.email); setStatus(null) }
          catch (e) { setStatus((e as Error).message as ApiResult) }
        },
        onError: () => setStatus('unavailable'),
      })
      el.innerHTML = ''
      void buttons.render(el)
    }).catch(() => setStatus('sdk'))
    return () => { cancelled = true; void buttons?.close().catch(() => {}) }
  }, [cfg, amount, pending, done])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pending || status === 'busy') return
    setStatus('busy')
    const r = await claim(pending, email, lang)
    if (r.result === 'ok') { setDone({ mailed: !!r.mailed }); setStatus(null) }
    else { setStatus(r.result); if (r.result === 'used') setPending(null) }
  }

  const error = status && status !== 'busy' ? (status === 'sdk' ? s.unavailable : s[status]) : null

  return createPortal(
    <div className="support-wrap" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="support-dialog" role="dialog" aria-modal="true" aria-label={s.title}>
        <button className="x support-x" onClick={onClose} aria-label={s.close}>×</button>
        {cfg === undefined ? <p className="muted">{s.loading}</p>
          : !cfg?.enabled && !pending ? (
            <>
              <h2>{s.title}</h2><p>{s.off}</p>
              {donateUrl && <a className="btn sm" href={donateUrl} target="_blank" rel="noopener noreferrer">{s.donate}</a>}
            </>
          ) : done ? (
            <>
              <h2>{s.doneTitle}</h2>
              <p>{done.mailed ? s.done.replace('{email}', email.trim()) : s.doneNoMail}</p>
              <button className="btn primary" onClick={onClose}>{s.close}</button>
            </>
          ) : pending ? (
            <form onSubmit={submit}>
              <h2>{s.emailTitle}</h2>
              <p>{s.emailIntro}</p>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={s.email} aria-label={s.email} autoComplete="email" required maxLength={254} />
              <button className="btn primary" disabled={!email.trim() || status === 'busy'}>{status === 'busy' ? s.busy : s.confirm}</button>
            </form>
          ) : (
            <>
              <h2>{s.title}</h2>
              <p>{s.intro.replace('{min}', money(cfg!.min))}</p>
              <div className="support-amounts" role="radiogroup">
                {PRESETS.filter(p => p >= cfg!.min && p <= cfg!.max).map(p => (
                  <button key={p} role="radio" aria-checked={amount === p} className={`chip ${amount === p ? 'on' : ''}`} onClick={() => setAmount(p)}>{money(p)}</button>
                ))}
                <label className="support-custom">
                  <span>{s.custom}</span>
                  <input type="number" min={cfg!.min} max={cfg!.max} step="1" value={amount}
                    onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) setAmount(Math.min(cfg!.max, Math.max(cfg!.min, n))) }} />
                </label>
              </div>
              <p className="support-pay">{s.pay}</p>
              {status === 'busy' && <p className="muted">{s.busy}</p>}
              <div ref={box} className={`support-paypal ${status === 'busy' ? 'busy' : ''}`}><span className="muted">{s.loading}</span></div>
              {cfg!.sandbox && <small className="muted">{s.sandbox}</small>}
            </>
          )}
        {error && <p className="support-error" role="alert">{error}</p>}
      </div>
    </div>,
    document.body,
  )
}
