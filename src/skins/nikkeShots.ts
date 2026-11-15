/**
 * Skin NIKKE (15 nov 2026, petición del dueño: "incorpora armas, que al hacer clic quede una marca de disparo que se borre luego de un rato").
 * Cada clic deja un impacto de bala donde se pulsó: destello azul y anillo que se abre (el disparo), y el agujero con sus grietas, que se
 * desvanece a los pocos segundos. Todo en una capa fija por encima de la página, sin capturar el ratón (no tapa nada ni cambia los clics).
 * El dibujo va en nikke.css ("Disparos"); el cursor es la mira del rifle de asalto del juego (icn_weapon_ar).
 * Solo con <html data-skin="nikke">; con "reducir movimiento", el impacto aparece y se va sin destello ni anillo.
 */
const root = document.documentElement
/** Impactos a la vez como máximo: los más antiguos se quitan antes (ráfagas de clics). */
const MAX = 14
/** Lo que dura un impacto en pantalla (ms); tiene que coincidir con la animación `nk-hole` de nikke.css. */
const LIFE = 2600

let layer: HTMLDivElement | null = null
function getLayer(): HTMLDivElement {
  if (layer?.isConnected) return layer
  layer = Object.assign(document.createElement('div'), { className: 'nk-shots' })
  layer.setAttribute('aria-hidden', 'true')
  document.body.appendChild(layer)
  return layer
}

function shoot(e: PointerEvent) {
  if (root.getAttribute('data-skin') !== 'nikke' || e.button !== 0 || !e.isPrimary) return
  const l = getLayer()
  while (l.childElementCount >= MAX) l.firstElementChild?.remove()
  const hit = document.createElement('i')
  hit.className = 'nk-shot'
  hit.style.left = `${e.clientX}px`
  hit.style.top = `${e.clientY}px`
  // Cada agujero, girado y de un tamaño algo distinto, para que una ráfaga no se vea repetida.
  hit.style.setProperty('--nk-rot', `${Math.floor(Math.random() * 360)}deg`)
  hit.style.setProperty('--nk-s', (0.85 + Math.random() * 0.3).toFixed(2))
  l.appendChild(hit)
  setTimeout(() => hit.remove(), LIFE + 100)
}

document.addEventListener('pointerdown', shoot, { capture: true, passive: true })
// Al cambiar de skin, se quitan los impactos que queden.
new MutationObserver(() => { if (root.getAttribute('data-skin') !== 'nikke') layer?.replaceChildren() })
  .observe(root, { attributes: true, attributeFilter: ['data-skin'] })
