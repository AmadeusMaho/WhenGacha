import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang, type Lang } from '../i18n'
import { supportConfig, type SupportConfig } from './premium'

/**
 * Ventana de apoyo de WhenGacha Premium: explica los pasos y enlaza a la página de Ko-fi. El pago se hace allí; Ko-fi avisa al servidor
 * (webhook, server/supporter.mjs) y este manda el enlace de acceso al correo con el que se pagó. Aquí no se cobra ni se guarda nada.
 */
const TXT: Record<Lang, Record<string, string>> = {
  es: { title: 'Apoya WhenGacha', intro: 'WhenGacha es gratis y no tiene anuncios. Si te sirve y quieres echar una mano, con {min} o más en Ko-fi te llevas Premium para siempre, con todas las skins y la insignia.',
    forever: 'Pagas una vez y es tuyo. No es una suscripción.',
    step1: 'Entra a Ko-fi y apoya con {min} o más. Puedes pagar con PayPal o con tarjeta.',
    step2: 'Te llegará un correo con un enlace para activarlo, al mismo correo que pusiste en Ko-fi. Si no lo ves, revisa spam.',
    step3: '¿Lo quieres en otro dispositivo? Abre el pincel y escribe ese mismo correo.',
    note: 'Si apoyas con menos de {min} te lo agradezco igual, solo que eso no activa Premium.',
    kofi: 'Ir a Ko-fi', login: 'Ya apoyé, quiero entrar', loading: 'Cargando…', close: 'Cerrar',
    off: 'El apoyo con Premium todavía no está activo.', donate: 'Donar igualmente' },
  en: { title: 'Support WhenGacha', intro: "WhenGacha is free and has no ads. If it's useful to you and you'd like to help out, {min} or more on Ko-fi gets you Premium forever, with every skin and the badge.",
    forever: "You pay once and it's yours. It's not a subscription.",
    step1: 'Head to Ko-fi and chip in {min} or more. You can pay with PayPal or a card.',
    step2: "You'll get an email with a link to turn it on, sent to the address you used on Ko-fi. If you don't see it, check spam.",
    step3: 'Want it on another device? Open the brush menu and type that same email.',
    note: "If you give less than {min} I'm just as thankful, it just won't turn on Premium.",
    kofi: 'Go to Ko-fi', login: 'I already supported, sign me in', loading: 'Loading…', close: 'Close',
    off: "Premium support isn't available yet.", donate: 'Donate anyway' },
  zh: { title: '支持 WhenGacha', intro: 'WhenGacha 免费且没有广告。如果它对你有用、想帮一把，在 Ko-fi 支持 {min} 或以上，就能永久获得高级版，包括所有皮肤和徽章。',
    forever: '一次付款，永久拥有，不是订阅。',
    step1: '前往 Ko-fi，支持 {min} 或以上。可以用 PayPal 或银行卡付款。',
    step2: '你会收到一封带开启链接的邮件，发到你在 Ko-fi 填写的邮箱。没看到的话请查看垃圾邮件。',
    step3: '想在其他设备上使用？打开画笔菜单，输入同一个邮箱即可。',
    note: '支持金额低于 {min} 我们也一样感谢，只是不会开启高级版。',
    kofi: '前往 Ko-fi', login: '我已支持，登录', loading: '加载中…', close: '关闭',
    off: '高级版支持功能尚未开放。', donate: '仍然捐赠' },
}

export default function SupportDialog({ onClose, onLogin, donateUrl }: { onClose: () => void; onLogin: () => void; donateUrl?: string }) {
  const lang = useLang()
  const s = TXT[lang] ?? TXT.es
  const [cfg, setCfg] = useState<SupportConfig | null | undefined>(undefined)

  useEffect(() => { void supportConfig().then(setCfg) }, [])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const min = cfg ? new Intl.NumberFormat(lang, { style: 'currency', currency: cfg.currency, maximumFractionDigits: 2 }).format(cfg.min) : ''
  const fill = (t: string) => t.replace('{min}', min)

  return createPortal(
    <div className="support-wrap" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="support-dialog" role="dialog" aria-modal="true" aria-label={s.title}>
        <button className="x support-x" onClick={onClose} aria-label={s.close}>×</button>
        {cfg === undefined ? <p className="muted">{s.loading}</p>
          : !cfg?.enabled || !cfg.kofiUrl ? (
            <>
              <h2>{s.title}</h2><p>{s.off}</p>
              {donateUrl && <a className="btn sm" href={donateUrl} target="_blank" rel="noopener noreferrer">{s.donate}</a>}
            </>
          ) : (
            <>
              <h2>{s.title}</h2>
              <p>{fill(s.intro)}</p>
              <p className="support-forever">{s.forever}</p>
              <ol className="support-steps">
                <li>{fill(s.step1)}</li>
                <li>{s.step2}</li>
                <li>{s.step3}</li>
              </ol>
              <a className="btn primary support-kofi" href={cfg.kofiUrl} target="_blank" rel="noopener noreferrer">{s.kofi}</a>
              <button className="linkbtn" onClick={onLogin}>{s.login}</button>
              <small className="muted">{fill(s.note)}</small>
            </>
          )}
      </div>
    </div>,
    document.body,
  )
}
