import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { LinkBanner } from '../LinkBanner/LinkBanner'
import { Toasts } from '../Toasts/Toasts'
import { useRouter } from '../../lib/router.store'
import styles from './Screen.module.scss'
import type { ScreenProps } from './Screen.types'

/**
 * Экран телефона: шапка (назад, заголовок, настройки предмета), полоса связи с IDE экрана, прокручиваемое тело
 * и низ над полосой «домой» - главные действия под большим пальцем. Уведомления встают сразу
 * над низом и не закрывают его кнопки. Высота - по видимой части экрана (dvh): клавиатура и
 * панели браузера её не перекрывают; у приложения с экрана «Домой» - весь экран (vh).
 */
export const Screen = ({
  title,
  subtitle,
  back = true,
  agentId,
  actions,
  banner,
  overlay,
  footer,
  bodyRef,
  children,
}: ScreenProps) => {
  const { t } = useTranslation()
  const goBack = useRouter((state) => state.back)

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        {back ? (
          <IconButton icon={ChevronLeft} size="touch" label={t('common.back')} onClick={goBack} />
        ) : (
          <span className={styles.edge} />
        )}
        <div className={styles.titles}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && (
            <div className={styles.subtitle}>
              {typeof subtitle === 'string' ? (
                <span className={styles.subtitleText}>{subtitle}</span>
              ) : (
                subtitle
              )}
            </div>
          )}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      {agentId && <LinkBanner agentId={agentId} />}
      {banner}
      <div className={styles.frame}>
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>
        {overlay}
      </div>
      {footer ? (
        <footer className={styles.footer}>
          <Toasts />
          {footer}
        </footer>
      ) : (
        <div className={styles.toastsAnchor}>
          <Toasts />
        </div>
      )}
    </div>
  )
}
