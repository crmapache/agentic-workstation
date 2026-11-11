import { ImageOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../MarkdownPreview.module.scss'
import type { WebImagesNoticeProps } from '../MarkdownPreview.types'
import { useWebImagesStore, useAllowedWebImages } from '../../web-images.store'

/**
 * Полоса над просмотром: в файле есть картинки с сайтов, которые ещё не показаны.
 * «Показать» разрешает ровно те адреса, что в файле сейчас (web-images.store.ts).
 */
export const WebImagesNotice = ({ projectId, path, urls }: WebImagesNoticeProps) => {
  const { t } = useTranslation()
  const allowed = useAllowedWebImages(projectId, path)
  const allow = useWebImagesStore((state) => state.allow)
  const hidden = urls.filter((url) => !allowed.includes(url)).length

  const handleShow = () => allow(projectId, path, urls)

  if (hidden === 0) return null

  return (
    <div role="status" className={styles.notice}>
      <ImageOff className={styles.noticeIcon} aria-hidden />
      <span className={styles.noticeText}>
        {t('editor.markdown.webImages.hidden', { count: hidden })}
      </span>
      <Button size="sm" onClick={handleShow}>
        {t('editor.markdown.webImages.show')}
      </Button>
    </div>
  )
}
