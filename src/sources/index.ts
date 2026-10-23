import type { Game } from '../types'
import { syncCzn } from './czn'
import { syncGame, type GameSync } from './ennead'
import { syncUma } from './uma'
import { buildPatches, fetchHistory, finalize } from './versions'
import { syncArknights, syncEndfield } from './wiki'

const HOUR = 3_600_000

/** Descarga eventos, banners, desafíos, parches y códigos de un juego. */
export async function syncSource(game: Game): Promise<GameSync> {
  const id = game.id
  switch (game.api) {
    case 'arknights': return syncArknights(id)
    case 'endfield': {
      const s = await syncEndfield(id)
      return { ...s, patches: finalize(s.patches, game.patchCycleDays) }
    }
    case 'uma': return syncUma(id)
    case 'czn': return syncCzn(id)
    case 'genshin':
    case 'starrail':
    case 'zenless': {
      const [s, history] = await Promise.all([syncGame(id, game.api), fetchHistory(game.api).catch(() => [])])
      return { ...s, patches: buildPatches(id, s.patches, history, game.patchCycleDays) }
    }
    default: throw new Error(`Sin fuente para ${game.name}`)
  }
}

/** Las wikis y sitios de la comunidad se consultan menos seguido para no abusar. */
export const staleMs = (g: Game) => (g.api === 'genshin' || g.api === 'starrail' || g.api === 'zenless' ? HOUR : g.api === 'uma' || g.api === 'czn' ? 3 * HOUR : 6 * HOUR)
