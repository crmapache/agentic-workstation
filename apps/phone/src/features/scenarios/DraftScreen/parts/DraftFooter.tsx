import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import type { useDraftScreen } from '../DraftScreen.hooks'
import styles from '../DraftScreen.module.scss'
import { useNow } from '../../../../lib/now.hooks'
import { durationText } from '../../../../lib/time.utils'

/** Модель пишет: сколько уже и «отменить». */
const Writing = ({
  startedAt,
  screen,
}: {
  startedAt: number
  screen: ReturnType<typeof useDraftScreen>
}) => {
  const { t } = useTranslation()
  const now = useNow(1000)

  return (
    <div className={styles.progress}>
      <Spinner size="sm" tone="accent" />
      <span className={styles.progressText}>
        {t('draft.writing', { time: durationText(t, now - startedAt) })}
      </span>
      <Button
        size="touch"
        variant="ghost"
        disabled={screen.isCancelling}
        onClick={screen.handleCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  )
}

/** Низ черновика по тому, где он: написать, ждать модель или сохранить и выбросить. */
export const DraftFooter = ({ screen }: { screen: ReturnType<typeof useDraftScreen> }) => {
  const { t } = useTranslation()
  const { phase } = screen

  switch (phase.kind) {
    case 'form':
      return (
        <Button
          size="touch"
          variant="primary"
          disabled={!screen.description.trim()}
          onClick={() => void screen.handleWrite()}>
          {t('draft.write')}
        </Button>
      )
    case 'writing':
      return <Writing startedAt={phase.startedAt} screen={screen} />
    case 'ready':
      return (
        <div className={styles.footer}>
          <Button size="touch" variant="ghost" onClick={screen.handleDiscard}>
            {t('draft.discard')}
          </Button>
          <Button
            size="touch"
            variant="primary"
            disabled={screen.isSaving}
            onClick={() => void screen.handleSave()}>
            {t('draft.save')}
          </Button>
        </div>
      )
  }
}
