// Carga el archivo .env de la raíz del proyecto en process.env, sin pisar las variables que ya traiga el proceso.
// Algunos hosts (Botkeep) no pasan las variables del panel al proceso: las escriben en un .env protegido y esperan que la app lo lea.
// Render y Docker las pasan directamente, así que allí esto no cambia nada. Se importa la PRIMERA en index.mjs, porque proxy.mjs
// y otros módulos leen process.env al cargarse.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env')

export const envFileKeys = []

let text = ''
try { text = readFileSync(FILE, 'utf8') } catch { /* sin .env: nada que cargar */ }

for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
  if (!m) continue
  const [, key, rest] = m
  let value = rest.trim()
  const q = value[0]
  if ((q === '"' || q === "'") && value.endsWith(q) && value.length >= 2) {
    value = value.slice(1, -1)
    if (q === '"') value = value.replace(/\\n/g, '\n')
  } else {
    value = value.replace(/\s+#.*$/, '') // comentario al final de la línea
  }
  if (process.env[key] === undefined) {
    process.env[key] = value
    envFileKeys.push(key)
  }
}
