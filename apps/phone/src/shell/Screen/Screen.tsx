import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useRouter } from '../../lib/router.store'
import styles from './Screen.module.scss'
import type { ScreenProps } from './Screen.types'

/**
 * Экран телефона: шапка (назад, заголовок, действия, «?»), прокручиваемое тело и низ над полосой
 * «домой». Высота - по видимой части экрана (dvh): клавиатура и панели браузера её не перекрывают.
 */
export const Screen = ({
  title,
  subtitle,
  back = true,
  actions,
  help,
  banner,
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
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
        {help && (
          <HelpButton
            size="touch"
            label={t('common.help')}
            title={help.title}
            text={help.text}
            closeLabel={t('common.close')}
          />
        )}
      </header>
      {banner}
      <div ref={bodyRef} className={styles.body}>
        {children}
      </div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  )
}
