/**
 * Cuando la app se sirve desde su propio servidor (Docker, VITE_USE_PROXY=1), las consultas a las fuentes
 * externas pasan por /proxy: el servidor las cachea y las comparte entre todos los visitantes.
 * En desarrollo (npm run dev) se consulta directamente cada fuente.
 */
const USE_PROXY = import.meta.env.VITE_USE_PROXY === '1'

export const viaProxy = (url: string): string => (USE_PROXY ? `/proxy?u=${encodeURIComponent(url)}` : url)
