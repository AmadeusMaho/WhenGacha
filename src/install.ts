import { useSyncExternalStore } from 'react'

/**
 * Instalar WhenGacha como app (PWA). Sirve sobre todo para los avisos: con la app instalada, el navegador deja que el service worker
 * los revise en segundo plano aunque WhenGacha esté cerrado (Periodic Background Sync, solo en apps instaladas), y en iPhone
 * es la única forma de recibir notificaciones. El botón va junto a "Avisar" en los ajustes de "Mis gachas" (Views.tsx).
 * El evento se guarda nada más cargar la página (el navegador lo lanza pronto, antes de que se monte esa sección).
 */
interface InstallEvent extends Event { prompt(): Promise<void> }

let ev: InstallEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ev = e as InstallEvent; emit() })
  window.addEventListener('appinstalled', () => { ev = null; emit() })
}

const sub = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb) } }

/** Abre el diálogo de instalación del navegador, o null si no se puede (ya instalada, o el navegador no lo ofrece). */
export function useInstall(): (() => void) | null {
  const e = useSyncExternalStore(sub, () => ev)
  return e ? () => { e.prompt().finally(() => { ev = null; emit() }) } : null
}

/** iPhone/iPad en Safari sin instalar: no hay botón; se instala con Compartir → "Añadir a pantalla de inicio". */
export const iosNotInstalled = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !standalone
}
