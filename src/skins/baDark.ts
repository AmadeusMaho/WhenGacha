/**
 * Modo oscuro de la skin Blue Archive (bluearchive.css, "Modo oscuro"; 13 nov 2026, el dueño: "está demasiado claro").
 * Encendido por defecto; se apaga con el interruptor del menú de skins, que solo sale con esta skin (SkinPicker.tsx).
 * Se guarda en el navegador (`whengacha:ba-dark` = "off" para el claro) y marca <html data-ba-dark>.
 */
const root = document.documentElement
const KEY = 'whengacha:ba-dark'
let dark = (() => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } })()
root.toggleAttribute('data-ba-dark', dark)
const listeners = new Set<() => void>()

export const baDark = () => dark
export const subscribeBaDark = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export function setBaDark(v: boolean) {
  dark = v
  try { localStorage.setItem(KEY, v ? 'on' : 'off') } catch { /* sin localStorage: vale para esta visita */ }
  root.toggleAttribute('data-ba-dark', v)
  listeners.forEach(l => l())
}
