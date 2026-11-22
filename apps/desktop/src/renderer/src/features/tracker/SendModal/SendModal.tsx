import { useState } from 'react'
import { Send, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'
import { SelectField } from '@agentic-workstation/ui/SelectField'
import { Switch } from '@agentic-workstation/ui/Switch'

import { useTrackerActions } from '../tracker.actions'
import { useTrackerStore } from '../tracker.store'
import { useScenarioQueues } from '../../../state/scenarios.queries'
import { useActiveProject } from '../../../state/workspace.queries'
import styles from './SendModal.module.scss'
import type { SendModalProps } from './SendModal.types'
import { sendingOf } from './SendModal.utils'
import { CardList } from './parts/CardList'

/**
 * Отправка в очередь сценариев: какие карточки уйдут (по порядку доски, без сценария - бледными
 * пометками) и куда - новая очередь (по желанию в своём worktree) или открытая очередь проекта.
 */
export const SendModal = ({ sending, board }: SendModalProps) => {
  const { t } = useTranslation()
  const project = useActiveProject()
  const { data } = useScenarioQueues()
  const { send } = useTrackerActions()
  const openSend = useTrackerStore((state) => state.openSend)
  const popover = usePopover()
  const [queueId, setQueueId] = useState<string | null>(null)
  const [worktree, setWorktree] = useState(false)
  const [busy, setBusy] = useState(false)
  const queues = (data?.queues ?? []).filter(
    (queue) => queue.projectPath === project?.rootPath && queue.closedAt === 0,
  )
  const chosen = queues.find((queue) => queue.id === queueId) ?? null
  const { cards, title } = sendingOf(board, sending, chosen?.id ?? null)
  // Пометки (карточки без сценария) встают в очередь, но запускать в них нечего - в счёт не идут.
  const runs = cards.filter((card) => card.scenario).length

  const handleClose = () => openSend(null)
  const handleSend = async () => {
    setBusy(true)

    const done = await send({
      source:
        sending.kind === 'group'
          ? { kind: 'group', groupId: sending.groupId }
          : { kind: 'card', cardId: sending.cardId },
      target: chosen ? { kind: 'queue', queueId: chosen.id } : { kind: 'new', worktree },
    })

    setBusy(false)
    if (done) handleClose()
  }
  const handlePick = (id: string | null) => {
    popover.close()
    setQueueId(id)
  }

  return (
    <Modal
      open
      icon={Workflow}
      title={t('tracker.send.title')}
      closeLabel={t('common.close')}
      onClose={handleClose}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={handleClose}>
            {t('tracker.send.cancel')}
          </Button>
          <Button
            variant="primary"
            icon={Send}
            disabled={runs === 0 || busy}
            onClick={() => void handleSend()}>
            {t('tracker.send.send', { count: runs })}
          </Button>
        </div>
      }>
      <div className={styles.body}>
        <CardList sending={sending} cards={cards} title={title} />
        <div>
          <SelectField
            {...popover.triggerProps}
            label={t('tracker.send.target')}
            value={chosen?.name ?? t('tracker.send.newQueue')}
          />
          <Popover {...popover.popoverProps} width="field">
            {popover.isOpen && (
              <Menu label={t('tracker.send.target')} autoFocus>
                <MenuItem
                  label={t('tracker.send.newQueue')}
                  selection="single"
                  checked={!chosen}
                  onSelect={() => handlePick(null)}
                />
                {queues.map((queue) => (
                  <MenuItem
                    key={queue.id}
                    label={queue.name}
                    selection="single"
                    checked={queue.id === chosen?.id}
                    onSelect={() => handlePick(queue.id)}
                  />
                ))}
              </Menu>
            )}
          </Popover>
        </div>
        {!chosen && (
          <Switch
            label={t('tracker.send.worktree')}
            description={t('tracker.send.worktreeHint')}
            checked={worktree}
            onChange={setWorktree}
          />
        )}
      </div>
    </Modal>
  )
}
