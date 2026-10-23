import { useEffect, useRef, useState } from 'react'
import { LANGS, setLang, t, useLang } from './i18n'

/** Botón pequeño para elegir el idioma (globo + código). */
export default function LangSwitch() {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc) }
  }, [open])

  const current = LANGS.find(l => l.id === lang)!
  return (
    <div className="lang" ref={box}>
      <button className="btn sm lang-btn" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        title={t('lang.title')} aria-label={`${t('lang.title')}: ${current.label}`}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9S14.600 18.300 12 21c-2.600-2.700-3.900-5.700-3.900-9S9.400 5.700 12 3z" />
        </svg>
        <span>{current.short}</span>
      </button>
      {open && (
        <ul className="lang-menu" role="menu">
          {LANGS.map(l => (
            <li key={l.id} role="none">
              <button role="menuitemradio" aria-checked={l.id === lang} className={l.id === lang ? 'on' : ''} onClick={() => { setLang(l.id); setOpen(false) }}>
                <span>{l.label}</span>{l.id === lang && <i>✓</i>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
