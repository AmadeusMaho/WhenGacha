/*
 * Auditoría de legibilidad de una skin (se pega en la consola del navegador, o se ejecuta con la herramienta de JS de la vista previa).
 * Recorre todo el texto visible, calcula el fondo real bajo cada elemento (subiendo por los padres hasta un color opaco;
 * si encuentra una imagen o degradado lo marca como "img" para revisarlo a ojo) y devuelve los que no llegan al contraste mínimo
 * (4.5:1 texto normal, 3:1 texto grande ≥ 18.66px negrita o ≥ 24px). Uso: await window.__skinAudit()  → lista de problemas.
 */
(() => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 } }
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b) }
  const mix = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 })
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
  function bgOf(el) {
    const layers = []; let img = false
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      const bi = s.backgroundImage
      // Degradado: se toma su primer color (donde suele ir el texto, a la izquierda/arriba). Imagen: se marca para revisarla a ojo.
      const grad = /^(linear|radial)-gradient/.test(bi) && !/url\(/.test(bi) ? parse(bi) : null
      if (grad && grad.a > 0) { layers.push(grad); if (grad.a >= 1) break; continue }
      if (bi !== 'none' && !/url\([^)]*(star|cursor)/.test(bi)) img = img || n
      if (s.borderImageSource && s.borderImageSource !== 'none') img = img || n // botones dibujados con piezas del juego (WuWa)
      // Pestañas de la cabecera: la activa va encima de `.nav-ind` (un hermano), que el script no ve; se revisan a ojo.
      if (n.matches('header nav button') && n.parentElement?.querySelector('.nav-ind')) img = img || n
      // Texto puesto encima de un <img> hermano (títulos sobre el arte de la ventana del evento).
      if (n.parentElement && [...n.parentElement.children].some(c => c !== n && c.matches('img, .hero-bg, .hero-art'))) img = img || n
      const c = parse(s.backgroundColor)
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 0, g: 0, b: 0, a: 1 }
    if (base.a < 1) base = { r: 0, g: 0, b: 0, a: 1 }
    for (let i = layers.length - 1; i >= 0; i--) base = mix(layers[i], base)
    return { bg: base, img }
  }
  window.__skinAudit = () => {
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const seen = new Set()
    while (walker.nextNode()) {
      const t = walker.currentNode; if (!t.textContent.trim()) continue
      const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el)
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue
      const s = getComputedStyle(el); if (s.visibility === 'hidden' || +s.opacity === 0) continue
      let op = 1; for (let n = el; n; n = n.parentElement) op *= +getComputedStyle(n).opacity
      const fg0 = parse(s.color); if (!fg0) continue
      const { bg, img } = bgOf(el)
      const fg = mix({ ...fg0, a: fg0.a * op }, bg)
      const cr = ratio(fg, bg)
      const size = parseFloat(s.fontSize), bold = +s.fontWeight >= 700
      const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5
      if (cr < need) out.push({ cr: +cr.toFixed(2), need, text: t.textContent.trim().slice(0, 40), sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''), fg: s.color, img: img ? (img.className || img.tagName) : '' })
    }
    return out.sort((a, b) => a.cr - b.cr)
  }
})()
