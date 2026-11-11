import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import type { RouteOf } from '../../../lib/route.types'
import { isRunOver, RUN_TONES } from '../../../lib/status.constants'
import { costText } from '../../../lib/time.utils'
import { Composer } from '../../../shell/Composer/Composer'
import { Screen } from '../../../shell/Screen/Screen'
import { useRunScreen } from './RunScreen.hooks'
import { CarryOnCard } from './parts/CarryOnCard'
import { RunControls } from './parts/RunControls'
import { RunNotes } from './parts/RunNotes'
import { RunQuestion } from './parts/RunQuestion'
import { RunSteps } from './parts/RunSteps'

/**
 * Прогон сценария: дорожка этапов и шагов, вопрос головы и ответ на него, «написать голове»,
 * продолжить после лимита или остановки. Пауза, продолжение и стоп - в шапке.
 */
export const RunScreen = ({ route }: { route: RouteOf<'run'> }) => {
  const { t } = useTranslation()
  const screen = useRunScreen(route)
  const { run } = screen
  const help = { title: t('run.help.title'), text: t('run.help.text') }

  if (!run) {
    return (
      <Screen title={t('run.title')} help={help}>
        {run === null ? (
          <EmptyState icon={SearchX} title={t('run.gone')} />
        ) : (
          <Spinner size="md" label={t('run.loading')} />
        )}
      </Screen>
    )
  }

  const over = isRunOver(run.state)

  return (
    <Screen
      title={run.scenarioName}
      subtitle={
        <>
          <Badge tone={RUN_TONES[run.state] ?? 'neutral'}>{t(`runState.${run.state}`)}</Badge>
          {costText(run.cost)}
        </>
      }
      actions={!over && <RunControls run={run} busy={screen.busy} onControl={screen.control} />}
      help={help}
      footer={
        !over && (
          <Composer
            draftKey={`run|${route.agentId}|${run.id}`}
            placeholder={t('run.tellPlaceholder')}
            sendLabel={t('run.tell')}
            onSend={screen.handleTell}
          />
        )
      }>
      {run.question && (
        <RunQuestion
          question={run.question}
          busy={screen.busy || run.answering}
          onAnswer={screen.answer}
        />
      )}
      <CarryOnCard run={run} busy={screen.busy} onCarryOn={screen.carryOn} />
      <RunSteps run={run} />
      <RunNotes notes={run.notes} />
    </Screen>
  )
}
