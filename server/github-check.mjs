// Diagnóstico al arrancar: ¿llega este servidor a GitHub? En Botkeep, api.github.com respondía 403 sin mensaje de GitHub a la lista
// de donantes. Se prueban tres peticiones y se registra quién contesta (cabecera "server") y cómo, sin mostrar nunca el token:
//   1. api.github.com sin token      → si da 403 aquí, el bloqueo es del host o de la IP, no del token.
//   2. api.github.com con el token   → si (1) va bien y esto no, el problema es el token o sus permisos.
//   3. raw.githubusercontent.com     → el respaldo de lectura (support/donors.mjs).
// Una sola vez por arranque, 3 peticiones: no gasta límites de GitHub.

async function probe(label, url, headers = {}) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'WhenGacha', ...headers }, signal: AbortSignal.timeout(10_000) })
    const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ')
    let msg = ''
    try { msg = JSON.parse(body)?.message ?? '' } catch { /* no es JSON */ }
    const detail = res.ok ? '' : ` ${msg || `cuerpo="${body.slice(0, 120)}"`}`
    console.log(`[github-check] ${label}: HTTP ${res.status} (server=${res.headers.get('server') ?? '?'}, tipo=${res.headers.get('content-type') ?? '?'})${detail}`)
  } catch (e) {
    console.log(`[github-check] ${label}: sin conexión (${e.cause?.code ?? e.name}: ${e.cause?.message ?? e.message})`)
  }
}

export async function githubCheck() {
  const repo = process.env.DONORS_REPO ?? ''
  const token = process.env.DONORS_TOKEN ?? ''
  if (!repo || !token) return // sin Premium configurado no hay nada que comprobar
  const file = process.env.DONORS_PATH || 'donors.json'
  await probe('api.github.com sin token', 'https://api.github.com/zen')
  await probe('api.github.com con token', `https://api.github.com/repos/${repo}`,
    { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' })
  await probe('raw.githubusercontent.com con token', `https://raw.githubusercontent.com/${repo}/HEAD/${file}`, { authorization: `Bearer ${token}` })
}
