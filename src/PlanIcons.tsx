/**
 * Iconos de la calculadora de tiradas (Planner.tsx): uno por fila del desglose, campo y título, para que no se pierda nada entre
 * tantas filas. Trazos simples de 24 px en `currentColor`, así cada skin los pinta con su color (clase .plan-ico en App.css).
 */
const PATHS = {
  gem: 'M6 3h12l4 6-10 12L2 9zM2 9h20M12 21 8 9l4-6 4 6z',
  ticket: 'M3 7a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4zM14 5v14',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  week: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8 13h2M12 13h2M16 13h0M8 16h2M12 16h2',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  wrench: 'M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L4 12l2.3-2.3a4 4 0 0 0 5 5M14.7 6.3 12 9',
  live: 'M4 6h16v11H4zM8 21h8M12 17v4M10 9.5v4l3.5-2z',
  shop: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  login: 'M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  sum: 'M18 5H6l6 7-6 7h12',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4v4M16 13h2',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0M12 12h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  calendar: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4',
  goal: 'M5 21V4M5 4l14 4-14 4',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4',
} as const

export type IconName = keyof typeof PATHS

/** `title`: icono de un título de sección; lleva también .sec-ico, que las skins ya tratan como el icono del título (quitan su adorno). */
export function Ico({ name, title }: { name: IconName; title?: boolean }) {
  return (
    <svg className={title ? 'plan-ico sec-ico' : 'plan-ico'} viewBox="0 0 24 24" aria-hidden width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  )
}
