// Genera códigos de apoyo (desbloquean las skins del sitio). Uso:
//
//   npm run donor-code          un código
//   npm run donor-code -- 5     cinco códigos
//
// Necesita SUPPORTER_SECRET: la misma clave que tiene el servidor (variable de entorno en Botkeep). Aquí se lee del entorno o de
// .env.local. El código se manda a quien donó (p. ej. al correo de su donación en PayPal); no se guarda nada en ningún sitio.
// Para anular uno: su parte central (WG-<id>-…) en SUPPORTER_REVOKED del servidor.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeCode } from '../server/supporter.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (!process.env.SUPPORTER_SECRET) {
  try {
    const m = /^\s*SUPPORTER_SECRET\s*=\s*(.+?)\s*$/m.exec(await readFile(path.join(ROOT, '.env.local'), 'utf8'))
    if (m) process.env.SUPPORTER_SECRET = m[1]
  } catch { /* sin .env.local */ }
}
if (!process.env.SUPPORTER_SECRET) {
  console.error('Falta SUPPORTER_SECRET (en el entorno o en .env.local). Crea una clave larga y al azar, p. ej.:')
  console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"')
  console.error('y ponla igual en .env.local y en las variables del servidor (Botkeep).')
  process.exit(1)
}
const n = Math.min(100, Math.max(1, Number(process.argv[2]) || 1))
for (let i = 0; i < n; i++) console.log(makeCode())
