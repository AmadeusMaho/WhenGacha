/**
 * Efecto giroscopio de la skin Arknights (arknights.css, "Efecto 3D").
 * - Con ratón: CADA botón se inclina levemente según dónde esté el ratón sobre él (pone --ak-tx / --ak-ty, de -1 a 1, en el propio
 *   botón como mucho una vez por fotograma, y los quita al salir).
 * - En móvil (13 nov 2026): como en el juego, con el GIROSCOPIO del teléfono: al inclinarlo, todas las baldosas, botones y tarjetas se
 *   inclinan a la vez (pone --ak-tx / --ak-ty en <html> y `data-ak-gyro`, que activa el CSS). La postura en que se sujeta el móvil es
 *   el "centro" y se va recalibrando despacio, así solo cuentan los giros. En iPhone el navegador pide permiso: se pide con el primer
 *   toque en la página (tiene que ser un gesto del usuario: se usa `click`); si se deniega, no pasa nada.
 * Solo con la skin puesta; nada con "reducir movimiento".
 * Se puede apagar (13 nov 2026, "por si molesta"): interruptor en el menú de skins, solo visible con esta skin (SkinPicker.tsx). Se guarda en
 * el navegador (`whengacha:ak-tilt` = "off") y marca <html data-ak-flat>; apagado, ni el ratón ni el sensor inclinan nada.
 */
const SEL = 'header nav button, .btn, .soon-card, .up-card, .pick, .portrait, .bport, .chip, .fopt, .bar, .gcard, .ecard'
const root = document.documentElement
const KEY = 'whengacha:ak-tilt'
let enabled = (() => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } })()
root.toggleAttribute('data-ak-flat', !enabled)
const tiltListeners = new Set<() => void>()
const on = () => enabled && root.getAttribute('data-skin') === 'arknights'

/** Interruptor del efecto (para `useSyncExternalStore`). */
export const tiltEnabled = () => enabled
export const subscribeTilt = (l: () => void) => { tiltListeners.add(l); return () => { tiltListeners.delete(l) } }
export function setTiltEnabled(v: boolean) {
  enabled = v
  try { localStorage.setItem(KEY, v ? 'on' : 'off') } catch { /* sin localStorage: vale para esta visita */ }
  root.toggleAttribute('data-ak-flat', !v)
  if (!v) { reset(cur); cur = null; stop() }
  tiltListeners.forEach(l => l())
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)')

// ---------- Ratón ----------
let cur: HTMLElement | null = null
let raf = 0, x = 0, y = 0

const reset = (el: HTMLElement | null) => { if (el) { el.style.removeProperty('--ak-tx'); el.style.removeProperty('--ak-ty') } }
const apply = () => { raf = 0; if (cur) { cur.style.setProperty('--ak-tx', x.toFixed(3)); cur.style.setProperty('--ak-ty', y.toFixed(3)) } }

window.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !on()) { if (cur) { reset(cur); cur = null } return }
  const el = (e.target as Element | null)?.closest?.(SEL) as HTMLElement | null
  if (el !== cur) { reset(cur); cur = el }
  if (!el) return
  const r = el.getBoundingClientRect()
  x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1))
  y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1))
  if (!raf) raf = requestAnimationFrame(apply)
}, { passive: true })
document.addEventListener('pointerleave', () => { reset(cur); cur = null })

// ---------- Giroscopio (pantallas táctiles) ----------
type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }
const touch = matchMedia('(hover: none) and (pointer: coarse)')
/** Grados de giro del teléfono que llevan la inclinación al máximo. */
const RANGE = 18
let base: { b: number; g: number } | null = null
let gx = 0, gy = 0, tx = 0, ty = 0, graf = 0, listening = false

const clamp = (v: number) => Math.max(-1, Math.min(1, v))
function frame() {
  graf = 0
  // Suavizado: se acerca un 18 % por fotograma al valor del sensor (sin tirones con un sensor ruidoso).
  tx += (gx - tx) * .18; ty += (gy - ty) * .18
  root.style.setProperty('--ak-tx', tx.toFixed(3)); root.style.setProperty('--ak-ty', ty.toFixed(3))
  if (Math.abs(gx - tx) > .002 || Math.abs(gy - ty) > .002) graf = requestAnimationFrame(frame)
}
function onOrient(e: DeviceOrientationEvent) {
  if (!on() || reduced.matches || e.beta == null || e.gamma == null) return
  root.setAttribute('data-ak-gyro', '')
  if (!base) base = { b: e.beta, g: e.gamma }
  // El centro sigue despacio a la postura (≈ 3 s): si cambias cómo sujetas el móvil, vuelve a quedar recto.
  base.b += (e.beta - base.b) * .02; base.g += (e.gamma - base.g) * .02
  gx = clamp((e.gamma - base.g) / RANGE); gy = clamp((e.beta - base.b) / RANGE)
  if (!graf) graf = requestAnimationFrame(frame)
}
function listen() {
  if (listening) return
  listening = true
  window.addEventListener('deviceorientation', onOrient)
}
function stop() {
  root.removeAttribute('data-ak-gyro'); root.style.removeProperty('--ak-tx'); root.style.removeProperty('--ak-ty'); base = null
}
if (touch.matches && 'DeviceOrientationEvent' in window) {
  const Ctor = DeviceOrientationEvent as OrientationCtor
  // Se escucha siempre (si el navegador no da datos, no llega nada y no cuesta nada). Donde hace falta permiso (iPhone/iPad), se pide
  // una vez con el primer `click` y la skin puesta (un toque también genera `click` y cuenta como gesto del usuario). No se espera a la
  // respuesta para escuchar: algunos navegadores traen requestPermission y contestan "denied" aunque no lo necesiten.
  listen()
  if (typeof Ctor.requestPermission === 'function') {
    const ask = () => {
      if (!on() || reduced.matches) return
      document.removeEventListener('click', ask, true)
      Ctor.requestPermission!().catch(() => {})
    }
    document.addEventListener('click', ask, true)
  }
  // Al quitar la skin, fuera la inclinación.
  new MutationObserver(() => { if (!on()) stop() }).observe(root, { attributes: true, attributeFilter: ['data-skin'] })
}
