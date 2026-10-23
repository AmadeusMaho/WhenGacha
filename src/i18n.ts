import { useSyncExternalStore } from 'react'
import { en, es, zh, type Key } from './locales'

export type Lang = 'es' | 'en' | 'zh'
export type { Key }

/** Idiomas disponibles; `locale` es el que se pasa a Intl / toLocaleDateString. */
export const LANGS: { id: Lang; label: string; short: string; locale: string; html: string }[] = [
  { id: 'es', label: 'Español', short: 'ES', locale: 'es', html: 'es' },
  { id: 'en', label: 'English', short: 'EN', locale: 'en', html: 'en' },
  { id: 'zh', label: '中文', short: '中', locale: 'zh-CN', html: 'zh-CN' },
]

const KEY = 'whengacha:lang'
const DICT: Record<Lang, Record<Key, string>> = { es, en, zh }
const isLang = (v: unknown): v is Lang => v === 'es' || v === 'en' || v === 'zh'

/** Idioma guardado; si no hay, el del navegador (es / en / zh); si no coincide con ninguno, inglés. */
function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (isLang(saved)) return saved
  } catch { /* sin almacenamiento */ }
  for (const l of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const p = l.toLowerCase().slice(0, 2)
    if (p === 'es' || p === 'en' || p === 'zh') return p
  }
  return 'en'
}

let current: Lang = detect()
const listeners = new Set<() => void>()

const apply = () => { document.documentElement.lang = LANGS.find(l => l.id === current)!.html }
apply()

export const getLang = () => current
export const locale = () => LANGS.find(l => l.id === current)!.locale

export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  try { localStorage.setItem(KEY, lang) } catch { /* ignorar */ }
  apply()
  listeners.forEach(l => l())
}

/** Suscribe un componente al idioma: se vuelve a renderizar cuando cambia. */
export function useLang(): Lang {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, getLang)
}

/** Traduce una clave; los marcadores {nombre} se reemplazan con `params`. */
export function t(key: Key, params?: Record<string, string | number>): string {
  let s = DICT[current][key] ?? DICT.es[key]
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v))
  return s
}

/**
 * Los adaptadores de datos escriben marcadores ⟦clave|argumento⟧ en vez de texto fijo en un idioma;
 * aquí se resuelven con el idioma actual (así cambiar de idioma no obliga a volver a descargar nada).
 */
export function tx(text: string): string {
  return text.replace(/⟦([\w.]+)(?:\|([^⟧]*))?⟧/g, (_m, key: string, arg?: string) =>
    key in es ? t(key as Key, { arg: arg ?? '' }) : (arg ?? ''))
}
