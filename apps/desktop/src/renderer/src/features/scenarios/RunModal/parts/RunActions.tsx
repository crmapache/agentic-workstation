import { useState } from 'react'
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  ScrollText,
  ChevronLeft,
  MessageSquare,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isRunFinished } from '@shared/scenario-runs'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import type { RunActionsProps } from '../RunModal.types'
import { isResumable } from '../../scenarios-runs.utils'
import { useScenarioActions } from '../../scenarios.actions'
import { AccRunBadge } from '../../AccRunBadge/AccRunBadge'
import { ScenarioConfirm } from '../../ScenarioConfirm/ScenarioConfirm'

/**
 * Кнопки в шапке окна прогона: разговор главного потока (или назад из журнала), пауза или
 * продолжение, стоп с вопросом. Законченный, но подхватываемый прогон вместо паузы и стопа
 * предлагает «Continue the run»; отказ главного процесса встаёт уведомлением с кодом. Прогон
 * плагина ACC - только смотреть: его ведёт ACC, остаются журналы и разговор головы.
 */
export const RunActions = ({
  place,
  run,
  logKey,
  onMainThread,
  onBack,
  onClose,
}: RunActionsProps) => {
  const { t } = useTranslation()
  const actions = useScenarioActions()
  const [isStopping, setIsStopping] = useState(false)
  const isOver = isRunFinished(run.state)
  const isOurs = run.origin !== 'acc'

  const handlePause = () => void actions.control(place, run.id, 'pause')

  const handleResume = () => void actions.control(place, run.id, 'resume')

  const handleAskStop = () => setIsStopping(true)

  const handleCloseStop = () => setIsStopping(false)

  const handleStop = () => {
    setIsStopping(false)
    void actions.control(place, run.id, 'stop')
  }

  const handleCarryOn = () => void actions.carryOn(run.id)

  const handleChat = () => void actions.openChat(place, run.id).then((ok) => ok && onClose())

  return (
    <>
      {logKey !== null ? (
        <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={onBack}>
          {t('scenarios.run.back')}
        </Button>
      ) : (
        // У головы нет своей строки в таймлайне, а «почему она так решила» - главный утренний вопрос.
        run.headConversationId && (
          <Tooltip label={t('scenarios.run.mainThreadHint')}>
            <Button size="sm" variant="ghost" icon={ScrollText} onClick={onMainThread}>
              {t('scenarios.run.mainThread')}
            </Button>
          </Tooltip>
        )
      )}
      {!isOurs && <AccRunBadge />}
      {isOurs &&
        !isOver &&
        (run.state === 'paused' ? (
          <Button size="sm" variant="primary" icon={Play} onClick={handleResume}>
            {t('scenarios.run.resume')}
          </Button>
        ) : (
          <Button size="sm" icon={Pause} onClick={handlePause}>
            {t('scenarios.run.pause')}
          </Button>
        ))}
      {isOurs && !isOver && (
        <Button size="sm" icon={Square} onClick={handleAskStop}>
          {t('scenarios.run.stop')}
        </Button>
      )}
      {isOver && run.headConversationId && (
        <Tooltip label={t('scenarios.run.chatHint')}>
          <Button size="sm" variant="ghost" icon={MessageSquare} onClick={handleChat}>
            {t('scenarios.run.chat')}
          </Button>
        </Tooltip>
      )}
      {isOurs && isOver && isResumable(run) && (
        <Tooltip label={t('scenarios.run.carryOnHint')}>
          <Button size="sm" variant="primary" icon={RotateCcw} onClick={handleCarryOn}>
            {t('scenarios.run.carryOn')}
          </Button>
        </Tooltip>
      )}
      <HelpButton
        label={t('scenarios.run.help.label')}
        title={t('scenarios.run.help.title')}
        text={t('scenarios.run.help.text')}
        closeLabel={t('common.close')}
      />
      {/* Оборванная карточка при подхвате начнётся заново, этапы после неё не случатся. */}
      <ScenarioConfirm
        open={isStopping}
        title={t('scenarios.run.stopTitle')}
        subject={run.scenarioName}
        note={t('scenarios.run.stopNote')}
        submit={t('scenarios.run.stop')}
        onSubmit={handleStop}
        onClose={handleCloseStop}
      />
    </>
  )
}
