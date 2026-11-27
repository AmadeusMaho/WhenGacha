import { useEffect, useState } from 'react'

/**
 * Adornos de temporada (26 nov 2026). Solo en la skin base (sin `data-skin` en <html>): las skins de juego tienen su propio diseño y no se tocan.
 * Se encienden y apagan solos por la fecha LOCAL de quien visita; quien no los quiera los apaga en "Mis gachas → Ajustes" (`state.festive`).
 * Para probar fuera de fecha: `?temporada=navidad` (o `?temporada=off` para verlos apagados) en la URL; se recuerda en la pestaña (sessionStorage).
 * El código y el CSS de cada temporada (Festive.tsx, festive.css) solo se descargan cuando toca (import dinámico en App.tsx).
 */
export type Season = 'christmas'

/** Temporadas por fecha (mes 1–12, día). Navidad: del 26 de noviembre a Reyes (6 de enero), cruzando el año (el dueño la adelantó el 27 nov 2026). */
const SEASONS: { id: Season; from: [number, number]; to: [number, number] }[] = [
  { id: 'christmas', from: [11, 26], to: [1, 6] },
]

/** Icono de cada temporada (en el interruptor de los ajustes). */
export const SEASON_ICON: Record<Season, string> = { christmas: '🎄' }

const ALIAS: Record<string, Season | 'off'> = { navidad: 'christmas', christmas: 'christmas', off: 'off', no: 'off' }
const KEY = 'whengacha:temporada'

/** Lo que pide la URL (`?temporada=navidad`), recordado en esta pestaña; si no, nada. */
function forced(): Season | 'off' | undefined {
  try {
    const q = new URLSearchParams(location.search).get('temporada')?.toLowerCase()
    if (q && ALIAS[q]) { sessionStorage.setItem(KEY, ALIAS[q]); return ALIAS[q] }
    const saved = sessionStorage.getItem(KEY)
    return saved === 'off' || saved === 'christmas' ? saved : undefined
  } catch { return undefined }
}

/** Temporada de una fecha (hora local), o null. */
export function seasonAt(d = new Date()): Season | null {
  const md = (d.getMonth() + 1) * 100 + d.getDate()
  for (const s of SEASONS) {
    const a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1]
    if (a <= b ? md >= a && md <= b : md >= a || md <= b) return s.id
  }
  return null
}

/** Temporada de hoy (o la forzada por la URL), sin mirar la skin ni el ajuste: para enseñar el interruptor solo cuando hay algo que apagar. */
export function seasonNow(): Season | null {
  const f = forced()
  return f === 'off' ? null : f ?? seasonAt()
}

const baseSkin = () => !document.documentElement.hasAttribute('data-skin')

/**
 * Temporada activa: hay temporada, el ajuste no la apaga y la skin es la base. Pone `data-season` en <html> (el CSS de festive.css cuelga de
 * ahí) y lo quita al cambiar de skin. Revisa la fecha cada hora (una pestaña abierta el 25 nov se enciende sola el 26).
 */
export function useSeason(enabled: boolean): Season | null {
  const [season, setSeason] = useState<Season | null>(null)
  useEffect(() => {
    const root = document.documentElement
    const update = () => {
      const s = enabled && baseSkin() ? seasonNow() : null
      setSeason(s)
      if (s) root.setAttribute('data-season', s)
      else root.removeAttribute('data-season')
    }
    update()
    const obs = new MutationObserver(update)
    obs.observe(root, { attributes: true, attributeFilter: ['data-skin'] })
    const timer = window.setInterval(update, 3_600_000)
    return () => { obs.disconnect(); clearInterval(timer); root.removeAttribute('data-season') }
  }, [enabled])
  return season
}
