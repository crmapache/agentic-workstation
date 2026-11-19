import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import type { ToolFeedItem } from '@shared/conversation-feed'

import { ElapsedTime } from '../ElapsedTime/ElapsedTime'
import { Markdown } from '../Markdown/Markdown'
import { PathLink } from '../PathLink/PathLink'
import styles from './ArtifactCard.module.scss'

/** Имя файла артефакта для ссылки: путь целиком длинный (папка разговора агента). */
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path

/**
 * Артефакт агента в ленте (Antigravity, ADR 0092): план, отчёт, список задач - файлом в папке
 * разговора. Подпись и описание агента, сам документ текстом и ссылка, которая открывает его
 * вкладкой редактора (Markdown - просмотром). review - агент ждёт отзыва: ответ - словами в чат.
 */
export const ArtifactCard = memo(({ tool }: { tool: ToolFeedItem }) => {
  const { t } = useTranslation()

  if (tool.action.kind !== 'artifact') return null

  const { path, summary, review } = tool.action
  const content = typeof tool.input['Content'] === 'string' ? tool.input['Content'] : ''

  return (
    <div className={styles.artifactCard}>
      <div className={styles.head}>
        <span className={styles.label}>{t('agentPanel.feed.artifact.label')}</span>
        {summary && <span className={styles.summary}>{summary}</span>}
      </div>
      {content && (
        <div className={styles.body}>
          <Markdown text={content} />
        </div>
      )}
      <div className={styles.foot}>
        <PathLink request={{ path, exact: true }}>{fileName(path)}</PathLink>
        {review && <span className={styles.hint}>{t('agentPanel.feed.artifact.review')}</span>}
        <span className={styles.spacer} />
        <ElapsedTime startedAt={tool.startedAt} endedAt={tool.endedAt} />
      </div>
    </div>
  )
})

ArtifactCard.displayName = 'ArtifactCard'
