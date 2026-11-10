// El fetch original de Node, guardado al cargar el servidor.
// El recolector (src/collector.ts, setup) sustituye globalThis.fetch por el del proxy para que las fuentes, escritas para el navegador,
// pasen por su lista cerrada y su caché. Ese sustituto rechaza cualquier otra URL ("Fuente no permitida") e ignora las cabeceras, así
// que lo que el servidor pide por su cuenta (lista de donantes en GitHub, correos de Resend) tiene que usar este.
export const nativeFetch = globalThis.fetch.bind(globalThis)
