import { useEffect } from 'react'
import { initAds, setConsent, subscribeConsent, useConsentPrompt } from './ads'
import { t, useLang } from './i18n'

/** Banner de consentimiento para anuncios. También se encarga de cargar AdSense cuando corresponde. */
export default function ConsentBanner() {
  useLang()
  const show = useConsentPrompt()
  useEffect(() => { initAds(); return subscribeConsent(initAds) }, [])
  if (!show) return null
  return (
    <div className="consent" role="dialog" aria-live="polite" aria-label={t('consent.title')}>
      <p>
        {t('consent.text')} <a href="/privacidad.html" target="_blank" rel="noopener">{t('footer.privacy')}</a>
      </p>
      <div className="consent-actions">
        <button className="btn sm" onClick={() => setConsent('denied')}>{t('consent.reject')}</button>
        <button className="btn sm primary" onClick={() => setConsent('granted')}>{t('consent.accept')}</button>
      </div>
    </div>
  )
}
