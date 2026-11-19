import { useTranslation } from 'react-i18next'

import { usePictureHover } from './PictureHover.hooks'
import styles from './PictureHover.module.scss'
import type { PictureHoverProps } from './PictureHover.types'

/**
 * Картинка за чипом под курсором - в поле, в отправленном сообщении, в очереди (как в
 * ACC): «Image #3» не отличает два скриншота. Плоский стеклянный слой над чипом, как
 * подсказка, но с картинкой, её путём (у выбранной) и размером; где клик открывает
 * картинку, под ней так и написано. Нечего показать - словами, а не пустой рамкой.
 */
export const PictureHover = ({ source, opens, children }: PictureHoverProps) => {
  const { t } = useTranslation()
  const { anchorRef, popoverRef, shown, handlers } = usePictureHover(source)
  const size =
    shown?.state === 'ready' && shown.width > 0
      ? t('agentPanel.picture.size', { width: shown.width, height: shown.height })
      : ''
  const caption = [size, opens ? t('agentPanel.picture.opens') : ''].filter(Boolean).join(' · ')

  return (
    <span ref={anchorRef} className={styles.anchor} {...handlers}>
      {children}
      {/* Только вид: у чипа под курсором своё имя для скринридера. */}
      <span ref={popoverRef} popover="hint" aria-hidden className={styles.preview}>
        {shown?.state === 'ready' && <img className={styles.image} src={shown.url} alt="" />}
        {shown?.state === 'loading' && <span className={styles.waiting} />}
        {shown && source.name && <span className={styles.name}>{source.name}</span>}
        {shown?.state === 'ready' && caption && <span className={styles.caption}>{caption}</span>}
        {shown?.state === 'missing' && (
          <span className={styles.missing}>{t('agentPanel.picture.missing')}</span>
        )}
      </span>
    </span>
  )
}
