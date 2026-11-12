import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ScenarioStepLog.module.scss'
import type { PlainLogProps } from '../ScenarioStepLog.types'

/**
 * Журнал без ленты провайдера: пока она грузится или когда её не дали (витрина, тест) - только
 * реплики обеих сторон текстом, как написаны. Вызовы и мысли без ленты не показать честно, и
 * лучше их не показывать, чем показать сырыми.
 */
export const PlainLog = ({ feed, speaker, onLoadEarlier }: PlainLogProps) => {
  const { t } = useTranslation()
  // В журнале шага карточке пишет главный поток, в разговоре главного потока ему пишет прогон.
  const asked = speaker === 'main' ? t('scenarios.run.log.head') : t('scenarios.run.log.scenario')
  const answered = speaker === 'main' ? t('scenarios.run.log.card') : t('scenarios.run.log.head')

  return (
    <div className={styles.plain}>
      {feed.hasEarlier && (
        <Button size="sm" variant="ghost" onClick={onLoadEarlier}>
          {t('scenarios.run.log.earlier')}
        </Button>
      )}
      {feed.items.map((item) =>
        item.kind === 'user' || item.kind === 'assistant' ? (
          <div key={item.id} className={styles.said}>
            <span className={styles.who}>{item.kind === 'user' ? asked : answered}</span>
            <div className={styles.text}>{item.text}</div>
          </div>
        ) : null,
      )}
    </div>
  )
}
