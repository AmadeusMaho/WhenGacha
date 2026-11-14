/**
 * Fondos animados: en movimiento o estáticos (13 nov 2026, el dueño: "en móvil consume bastante"). Selector en el menú de skins
 * (SkinPicker.tsx), solo con una skin que tenga fondos; se guarda en el navegador (`whengacha:live-mode`).
 * - "auto" (por defecto): según la conexión (Network Information API). Estáticos con ahorro de datos, con datos móviles (`type: cellular`) o
 *   con conexión lenta (`effectiveType` 2g/3g). Si el navegador no dice nada de la conexión (Safari/iPhone, Firefox), en móvil quedan
 *   estáticos (es donde se paga por datos) y en escritorio se mueven.
 * - "on": siempre en movimiento. "off": siempre estáticos.
 * Con "reducir movimiento" del sistema, siempre estáticos.
 * Estático = el fotograma fijo de cada fondo (su póster, ~45 KB): no se descarga el vídeo.
 */
export type LiveMode = 'auto' | 'on' | 'off'
type Conn = EventTarget & { saveData?: boolean; type?: string; effectiveType?: string }

const KEY = 'whengacha:live-mode'
const conn = () => (navigator as Navigator & { connection?: Conn }).connection
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const mobile = matchMedia('(hover: none) and (pointer: coarse), (max-width: 700px)')

let mode: LiveMode = (() => { try { const v = localStorage.getItem(KEY); return v === 'on' || v === 'off' ? v : 'auto' } catch { return 'auto' } })()
const listeners = new Set<() => void>()
const emit = () => { snap = compute(); listeners.forEach(l => l()) }

/** ¿La conexión actual aconseja no descargar vídeo? `undefined` si el navegador no informa. */
function meteredOrSlow(): boolean | undefined {
  const c = conn()
  if (!c) return undefined
  if (c.saveData) return true
  if (c.type === 'cellular') return true
  if (c.effectiveType && /^(slow-2g|2g|3g)$/.test(c.effectiveType)) return true
  // Chrome de escritorio no da `type`: con `effectiveType` 4g y sin ahorro de datos, se mueven.
  return c.type || c.effectiveType ? false : undefined
}

function compute(): { mode: LiveMode; animated: boolean } {
  if (reduced.matches) return { mode, animated: false }
  if (mode !== 'auto') return { mode, animated: mode === 'on' }
  const m = meteredOrSlow()
  return { mode, animated: m === undefined ? !mobile.matches : !m }
}
let snap = compute()

conn()?.addEventListener?.('change', emit)
reduced.addEventListener('change', emit)
mobile.addEventListener('change', emit)

export const liveState = () => snap
export const subscribeLive = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export function setLiveMode(v: LiveMode) {
  mode = v
  try { localStorage.setItem(KEY, v) } catch { /* sin localStorage: vale para esta visita */ }
  emit()
}
