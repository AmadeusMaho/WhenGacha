// Correos de acceso a WhenGacha Premium, enviados con la API de Resend (resend.com). Sin dependencias: una petición HTTP.
// Variables: RESEND_API_KEY, MAIL_FROM ("WhenGacha <no-reply@tu-dominio>", con el dominio verificado en Resend) y PUBLIC_URL
// (https://tu-dominio, sin barra final): de ahí sale el enlace del correo. No se usa la cabecera Host de la petición para que nadie
// pueda hacer que el correo apunte a otra web.

export const mailConfigured = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM && /^https:\/\/[^/]+$/.test(process.env.PUBLIC_URL ?? ''))
export const publicUrl = () => process.env.PUBLIC_URL ?? ''

const T = {
  es: { subjectNew: '¡Gracias por apoyar WhenGacha! Tu acceso Premium', subject: 'Tu enlace para entrar a WhenGacha Premium',
    hiNew: '¡Gracias por apoyar WhenGacha! 💛 Ya tienes Premium para siempre.', hi: 'Aquí tienes tu enlace para activar Premium en este dispositivo.',
    how: 'Ábrelo en el navegador donde quieras usar Premium. Caduca en 30 minutos y sirve una sola vez.',
    again: 'Para entrar desde otro dispositivo, abre el pincel de la web y escribe este correo: te llegará otro enlace.',
    btn: 'Activar Premium', ignore: 'Este enlace es personal: no lo compartas. Si no lo pediste tú, ignora este correo.' },
  en: { subjectNew: 'Thanks for supporting WhenGacha! Your Premium access', subject: 'Your link to sign in to WhenGacha Premium',
    hiNew: 'Thanks for supporting WhenGacha! 💛 You now have Premium for good.', hi: 'Here is your link to turn on Premium on this device.',
    how: 'Open it in the browser where you want Premium. It expires in 30 minutes and works only once.',
    again: 'To sign in on another device, open the brush menu on the site and enter this email: you will get a new link.',
    btn: 'Turn on Premium', ignore: "This link is personal: please don't share it. If you didn't ask for this, just ignore this email." },
  zh: { subjectNew: '感谢支持 WhenGacha！你的高级版访问', subject: '你的 WhenGacha 高级版登录链接',
    hiNew: '感谢支持 WhenGacha！💛 你已永久拥有高级版。', hi: '这是在此设备上开启高级版的链接。',
    how: '请在想使用高级版的浏览器中打开。链接 30 分钟后失效，且只能使用一次。',
    again: '要在其他设备登录，请打开网站上的画笔菜单并输入此邮箱，你会收到新的链接。',
    btn: '开启高级版', ignore: '此链接仅供你本人使用，请勿分享。如果这不是你本人的操作，请忽略此邮件。' },
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** Envía el enlace de acceso. `welcome`: es el primer correo, justo después del pago. */
export async function sendAccessLink(to, link, lang, welcome) {
  const t = T[lang] ?? T.es
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1b1a17">
<h2 style="margin:0 0 12px">WhenGacha</h2><p>${esc(welcome ? t.hiNew : t.hi)}</p><p>${esc(t.how)}</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#d6ad5c;color:#2a1f08;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700">${esc(t.btn)}</a></p>
<p style="color:#555;font-size:14px">${esc(t.again)}</p><p style="color:#888;font-size:13px">${esc(t.ignore)}</p></div>`
  const text = `${welcome ? t.hiNew : t.hi}\n\n${t.how}\n${link}\n\n${t.again}\n${t.ignore}`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject: welcome ? t.subjectNew : t.subject, html, text }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`resend → HTTP ${res.status}`)
}
