/**
 * MD5 (RFC 1321) de un texto en UTF-8, en hexadecimal. Solo para construir rutas de imágenes de MediaWiki, que guarda cada archivo en
 * `/images/<h[0]>/<h[0..1]>/<archivo>` con h = md5 del nombre (azurlane.ts). Funciona igual en el navegador y en Node.
 */
const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21]
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0)

export function md5(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const len = ((bytes.length + 8) >> 6) + 1
  const w = new Uint32Array(len * 16)
  bytes.forEach((b, i) => { w[i >> 2] |= b << ((i % 4) * 8) })
  w[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8)
  w[len * 16 - 2] = (bytes.length * 8) >>> 0
  w[len * 16 - 1] = Math.floor(bytes.length / 0x20000000)
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let o = 0; o < w.length; o += 16) {
    let a = a0, b = b0, c = c0, d = d0
    for (let i = 0; i < 64; i++) {
      const r = i >> 4
      const f = r === 0 ? (b & c) | (~b & d) : r === 1 ? (d & b) | (~d & c) : r === 2 ? b ^ c ^ d : c ^ (b | ~d)
      const g = r === 0 ? i : r === 1 ? (5 * i + 1) % 16 : r === 2 ? (3 * i + 5) % 16 : (7 * i) % 16
      const s = S[r * 4 + (i % 4)]
      const t = (a + f + K[i] + w[o + g]) >>> 0
      a = d; d = c; c = b
      b = (b + ((t << s) | (t >>> (32 - s)))) >>> 0
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0
  }
  return [a0, b0, c0, d0].map(x => [0, 8, 16, 24].map(s => ((x >>> s) & 0xff).toString(16).padStart(2, '0')).join('')).join('')
}
