import { useTranslation } from 'react-i18next'

import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'
import { Section } from '@agentic-workstation/ui/Section'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import { ScenarioView } from '../ScenarioView/ScenarioView'
import type { RouteOf } from '../../../lib/route.types'
import { OptionList } from '../../../shell/OptionList/OptionList'
import { Screen } from '../../../shell/Screen/Screen'
import { SHELF_CHOICES, DRAFT_MAX_CHARS } from './DraftScreen.constants'
import { useDraftScreen } from './DraftScreen.hooks'
import styles from './DraftScreen.module.scss'
import { DraftFooter } from './parts/DraftFooter'

/**
 * Сценарий, написанный моделью по описанию: описание и полка, пока модель пишет - ход работы, а
 * написанное - на чтение с «сохранить на полку» и «выбросить». Править написанное - в IDE или
 * новым описанием: редактора на телефоне нет.
 */
export const DraftScreen = ({ route }: { route: RouteOf<'draft'> }) => {
  const { t } = useTranslation()
  const screen = useDraftScreen(route)
  const { phase } = screen

  return (
    <Screen
      title={t('draft.title')}
      agentId={route.agentId}
      help={{ title: t('draft.help.title'), text: t('draft.help.text') }}
      footer={<DraftFooter screen={screen} />}>
      {phase.kind === 'ready' ? (
        <ScenarioView scenario={phase.scenario} />
      ) : (
        <>
          <TextArea
            label={t('draft.description')}
            placeholder={t('draft.placeholder')}
            value={screen.description}
            maxLength={DRAFT_MAX_CHARS}
            disabled={phase.kind === 'writing'}
            onChange={screen.setDescription}
          />
          <Section size="sm" title={t('draft.shelf')}>
            <OptionList
              label={t('draft.shelf')}
              options={SHELF_CHOICES.map((scope) => ({
                value: scope,
                label: t(`start.shelf.${scope}`),
              }))}
              isSelected={(value) => value === screen.scope}
              disabled={phase.kind === 'writing'}
              onSelect={screen.setScope}
            />
          </Section>
          {phase.kind === 'writing' && <ProgressBar label={t('draft.progress')} />}
          {phase.kind === 'form' && phase.failure && (
            <p className={styles.error}>{phase.failure}</p>
          )}
        </>
      )}
    </Screen>
  )
}
