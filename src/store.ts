import { useCallback, useEffect, useRef, useState } from 'react'
import { CATALOG, initialState } from './catalog'
import { staleMs, syncSource } from './sources'
import type { AppState } from './types'

const KEY = 'whengacha:v2'
/** Sube este número cuando cambie el formato de los datos descargados: se vuelven a descargar una vez. */
const SCHEMA = '3'
const SCHEMA_KEY = 'whengacha:schema'

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const saved = { ...initialState(), ...JSON.parse(raw) } as AppState
      if (localStorage.getItem(SCHEMA_KEY) !== SCHEMA) {
        localStorage.setItem(SCHEMA_KEY, SCHEMA)
        return { ...saved, events: [], patches: [], codes: {}, synced: {} } // se conservan tus juegos, tareas y completados
      }
      return saved
    }
  } catch {
    /* storage no disponible o corrupto */
  }
  return initialState()
}

export function useStore() {
  const [state, setState] = useState<AppState>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* ignorar */
    }
  }, [state])
  return [state, setState] as const
}

export type SyncStatus = { busy: boolean; failed?: string[]; last?: number }

/** Sincroniza los juegos con API (eventos, banners, desafíos, parches y códigos). */
export function useAutoSync(state: AppState, setState: React.Dispatch<React.SetStateAction<AppState>>) {
  const [status, setStatus] = useState<SyncStatus>({ busy: false })
  const syncedRef = useRef(state.synced)
  syncedRef.current = state.synced
  const trackedRef = useRef(state.tracked)
  trackedRef.current = state.tracked

  const sync = useCallback(async (force = false) => {
    // Solo se consultan los juegos que sigues (los demás no hacen falta hasta que los agregues).
    const targets = CATALOG.filter(g => g.api && trackedRef.current.includes(g.id) && (force || Date.now() - (syncedRef.current[g.id] ?? 0) > staleMs(g)))
    if (!targets.length) return
    setStatus(s => ({ ...s, busy: true, failed: undefined }))
    const results = await Promise.allSettled(targets.map(g => syncSource(g)))
    const failed: string[] = []
    setState(s => {
      let next = s
      results.forEach((r, i) => {
        const g = targets[i]
        if (r.status === 'rejected') { failed.push(g.name); return }
        const keep = next.events.filter(e => !(e.gameId === g.id && e.source === 'api'))
        const keepPatches = next.patches.filter(p => !(p.gameId === g.id && p.source === 'api'))
        next = {
          ...next,
          events: [...keep, ...r.value.events],
          patches: [...keepPatches, ...r.value.patches],
          codes: { ...next.codes, [g.id]: r.value.codes },
          synced: { ...next.synced, [g.id]: Date.now() },
        }
      })
      return next
    })
    setStatus({ busy: false, last: Date.now(), failed: failed.length ? failed : undefined })
  }, [setState])

  // Se vuelve a sincronizar cuando agregas un juego.
  const trackedKey = state.tracked.join(',')
  useEffect(() => {
    sync()
    const t = setInterval(() => sync(), 15 * 60 * 1000)
    const onOnline = () => sync(true)
    window.addEventListener('online', onOnline)
    return () => { clearInterval(t); window.removeEventListener('online', onOnline) }
  }, [sync, trackedKey])

  return { status, sync }
}
