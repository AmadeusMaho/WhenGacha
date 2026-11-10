// Gestión manual de WhenGacha Premium (la misma lista de donantes que usa el servidor: repo privado de GitHub). Uso:
//
//   npm run premium -- add correo@ejemplo.com      dar Premium (regalo, amigo, donación por otra vía) y mandarle el enlace de acceso
//   npm run premium -- revoke correo@ejemplo.com   quitarlo (reembolso, abuso…): pierde el acceso al revalidar (≤ 12 h)
//   npm run premium -- check correo@ejemplo.com    ver si tiene Premium
//
// Lee de .env.local (o del entorno) SUPPORTER_SECRET y DONORS_*; para "add" con envío del correo, también RESEND_API_KEY, MAIL_FROM y PUBLIC_URL.
// El correo no se guarda: solo su huella (la misma que calcula el servidor).
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  for (const line of (await readFile(path.join(ROOT, '.env.local'), 'utf8')).split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && /^(SUPPORTER_|DONORS_|RESEND_|MAIL_|PUBLIC_URL)/.test(m[1]) && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch { /* sin .env.local */ }

const { addDonor, donorsConfigured, isDonor, revokeDonor } = await import('../server/support/donors.mjs')
const { mailConfigured, publicUrl, sendAccessLink } = await import('../server/support/mail.mjs')
const { emailHash, normEmail, secretConfigured, sign, validEmail } = await import('../server/support/tokens.mjs')

const [cmd, raw] = process.argv.slice(2)
const email = normEmail(raw)
if (!['add', 'revoke', 'check'].includes(cmd) || !validEmail(email)) {
  console.error('Uso: npm run premium -- add|revoke|check correo@ejemplo.com')
  process.exit(1)
}
if (!secretConfigured() || !donorsConfigured()) {
  console.error('Faltan SUPPORTER_SECRET y/o DONORS_REPO + DONORS_TOKEN (en .env.local o en el entorno). Ver docs/premium.md.')
  process.exit(1)
}
const h = emailHash(email)

if (cmd === 'check') {
  console.log((await isDonor(h)) ? `${email}: tiene Premium.` : `${email}: no tiene Premium.`)
} else if (cmd === 'revoke') {
  console.log((await revokeDonor(h)) ? `${email}: Premium anulado (lo pierde al revalidar, como mucho en 12 h).` : `${email}: no estaba en la lista o ya estaba anulado.`)
} else {
  await addDonor(h, { id: 'manual', amount: '0.00', currency: '-' })
  console.log(`${email}: Premium dado.`)
  if (mailConfigured()) {
    await sendAccessLink(email, `${publicUrl()}/?acceso=${encodeURIComponent(sign('login', { h }, 30 * 60_000))}`, 'es', true)
    console.log('Enlace de acceso enviado por correo.')
  } else {
    console.log('No se envió correo (falta RESEND_API_KEY, MAIL_FROM o PUBLIC_URL). Puede pedir el enlace desde el pincel de la web.')
  }
}
