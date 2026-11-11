import { useState } from 'react'
import { ListX, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Section } from '@agentic-workstation/ui/Section'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import type { RouteOf } from '../../../lib/route.types'
import { Screen } from '../../../shell/Screen/Screen'
import { TextDialog } from '../../../shell/TextDialog/TextDialog'
import { useQueueScreen } from './QueueScreen.hooks'
import styles from './QueueScreen.module.scss'
import { CurrentRun } from './parts/CurrentRun'
import { QueueItemCard } from './parts/QueueItemCard'

/**
 * Очередь сценариев: идущий прогон (пауза, продолжить, стоп, остановиться после него), элементы
 * по порядку, ждущие - переставить, убрать, остановиться после них. Закрыть очередь и удалить её
 * worktree с телефона нельзя.
 */
export const QueueScreen = ({ route }: { route: RouteOf<'queue'> }) => {
  const { t } = useTranslation()
  const screen = useQueueScreen(route)
  const { message, queue, run } = screen
  const [isRenaming, setIsRenaming] = useState(false)
  const help = { title: t('queue.help.title'), text: t('queue.help.text') }

  if (!message || !queue) {
    return (
      <Screen title={t('queue.title')} help={help}>
        {message ? (
          <EmptyState icon={ListX} title={t('queue.gone')} />
        ) : (
          <Spinner size="md" label={t('project.loadingQueues')} />
        )}
      </Screen>
    )
  }

  const where =
    queue.workdir.kind === 'worktree' ? queue.workdir.gitBranch : t('queue.projectFolder')
  const waiting = queue.items.filter((item) => item.state === 'waiting')

  return (
    <Screen
      title={queue.name}
      subtitle={where}
      help={help}
      actions={
        <IconButton
          icon={Pencil}
          size="touch"
          label={t('queue.rename')}
          onClick={() => setIsRenaming(true)}
        />
      }>
      {queue.hold && (
        <Card
          title={t('queue.heldTitle')}
          description={t(`queue.holdReason.${queue.hold.reason}`, { defaultValue: '' })}>
          <Button
            size="touch"
            variant="primary"
            disabled={screen.busy}
            onClick={() => screen.queueAction({ kind: 'resume' })}>
            {t('queue.resume')}
          </Button>
        </Card>
      )}
      {run && <CurrentRun route={route} queue={queue} run={run} screen={screen} />}
      <Section size="sm" title={t('queue.items')} count={queue.items.length}>
        <div className={styles.items}>
          {queue.items.map((item) => (
            <QueueItemCard
              key={item.id}
              route={route}
              queue={queue}
              item={item}
              position={waiting.indexOf(item)}
              waitingCount={waiting.length}
              screen={screen}
            />
          ))}
        </div>
      </Section>
      <TextDialog
        key={isRenaming ? queue.name : 'closed'}
        open={isRenaming}
        title={t('queue.rename')}
        label={t('queue.name')}
        initial={queue.name}
        maxLength={80}
        onSave={(name) => screen.queueAction({ kind: 'rename', name })}
        onClose={() => setIsRenaming(false)}
      />
    </Screen>
  )
}
