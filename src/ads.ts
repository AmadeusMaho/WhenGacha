import { useSyncExternalStore } from 'react'

/** ID de editor de AdSense, p. ej. 'ca-pub-1234567890123456'. Vacío = sin anuncios ni banner. */
export const ADSENSE_CLIENT = ''

/**
 * 'own'    → banner propio: el script de AdSense solo se carga si el visitante pulsa «Aceptar».
 * 'google' → sin banner propio: el script se carga siempre y el mensaje de consentimiento lo muestra Google
 *            (AdSense › Privacidad y mensajes). Es la vía certificada para personalizar anuncios en la UE/Reino Unido/Suiza.
 */
export const CONSENT_MODE: 'own' | 'google' = 'own'

export type Choice = 'granted' | 'denied' | null
const KEY = 'whengacha:consent'

function read(): Choice {
  try { const v = localStorage.getItem(KEY); return v === 'granted' || v === 'denied' ? v : null } catch { return null }
}

let choice: Choice = read()
let reopened = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

/** El banner propio solo existe si hay anuncios configurados y se usa el modo 'own'. */
export const consentEnabled = !!ADSENSE_CLIENT && CONSENT_MODE === 'own'

export function setConsent(next: Exclude<Choice, null>) {
  const was = choice
  choice = next
  reopened = false
  try { localStorage.setItem(KEY, next) } catch { /* sin almacenamiento */ }
  // Un script ya cargado no se puede descargar: si retiran el permiso, se recarga la página.
  if (was === 'granted' && next === 'denied') { location.reload(); return }
  emit()
}

export const reopenConsent = () => { reopened = true; emit() }

/** Devuelve true si hay que mostrar el banner (sin decisión previa o reabierto desde el pie). */
export function useConsentPrompt(): boolean {
  const snap = useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => `${choice}|${reopened}`)
  return consentEnabled && (snap.startsWith('null') || snap.endsWith('true'))
}

let loaded = false
/** Carga el script de AdSense una sola vez, si hay ID y (modo Google o consentimiento concedido). */
export function initAds() {
  if (loaded || !ADSENSE_CLIENT) return
  if (CONSENT_MODE === 'own' && choice !== 'granted') return
  loaded = true
  const s = document.createElement('script')
  s.async = true
  s.crossOrigin = 'anonymous'
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`
  document.head.appendChild(s)
}

export const subscribeConsent = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }
