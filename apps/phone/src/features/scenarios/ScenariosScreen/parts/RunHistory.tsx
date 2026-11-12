import { useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RunSummaryWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Section } from '@agentic-workstation/ui/Section'

import type { useScenariosScreen } from '../ScenariosScreen.hooks'
import styles from '../ScenariosScreen.module.scss'
import { useNow } from '../../../../lib/now.hooks'
import type { RouteOf } from '../../../../lib/route.types'
import { useRouter } from '../../../../lib/router.store'
import { RUN_TONES } from '../../../../lib/status.constants'
import { costText, momentText } from '../../../../lib/time.utils'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'

/**
 * Прошлые прогоны проекта, свежие сверху: состояние, когда начался, сколько стоил. Звезда и
 * удаление - справа у строки (удалить - с «точно?»), нажатие открывает прогон.
 */
export const RunHistory = ({
  route,
  runs,
  more,
  screen,
}: {
  route: RouteOf<'scenarios'>
  runs: RunSummaryWire[]
  more: boolean
  screen: ReturnType<typeof useScenariosScreen>
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const now = useNow(60_000)
  const [deleting, setDeleting] = useState<string | null>(null)

  return (
    <Section
      size="sm"
      title={t('scenarios.history')}
      count={runs.length}
      description={runs.length === 0 ? t('scenarios.noRuns') : undefined}>
      {runs.length > 0 && (
        <ListGroup label={t('scenarios.history')}>
          {runs.map((run) => (
            <ListRow
              key={run.id}
              title={run.scenarioName}
              description={
                <>
                  <Badge tone={RUN_TONES[run.state] ?? 'neutral'}>
                    {t(`runState.${run.state}`, { defaultValue: run.state })}
                  </Badge>
                  {[momentText(run.startedAt - screen.offset, now), costText(run.cost)].join(' · ')}
                </>
              }
              aside={
                // Прогон ACC IDE только показывает: звезду и удаление решает плагин.
                run.origin === 'acc' ? (
                  <Badge tone="neutral">{t('scenarios.accRun')}</Badge>
                ) : (
                  <>
                    <IconButton
                      icon={Star}
                      size="touch"
                      label={t(run.starred ? 'scenarios.unstar' : 'scenarios.star')}
                      active={run.starred ?? false}
                      disabled={screen.busy}
                      onClick={() => screen.handleStar(run.id, !run.starred)}
                    />
                    <IconButton
                      icon={Trash2}
                      size="touch"
                      label={t('scenarios.deleteRun')}
                      disabled={screen.busy}
                      onClick={() => setDeleting(run.id)}
                    />
                  </>
                )
              }
              onClick={() =>
                navigate({
                  name: 'run',
                  agentId: route.agentId,
                  projectKey: route.projectKey,
                  runId: run.id,
                })
              }
            />
          ))}
        </ListGroup>
      )}
      {more && <p className={styles.note}>{t('scenarios.moreRuns')}</p>}
      <ConfirmDialog
        open={deleting !== null}
        title={t('scenarios.deleteRunConfirm')}
        text={t('scenarios.deleteRunText')}
        confirmLabel={t('scenarios.delete')}
        onConfirm={() => deleting && screen.handleDeleteRun(deleting)}
        onClose={() => setDeleting(null)}
      />
    </Section>
  )
}
