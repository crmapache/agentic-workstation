import { Undo2, Sparkles, CheckCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import { PROVIDER_ICONS, PROVIDER_LABEL_KEYS } from '../../../lib/provider-panels.constants'
import { useOverlapActions } from './OverlapActions.hooks'
import styles from './OverlapActions.module.scss'
import type { OverlapActionsProps } from './OverlapActions.types'

/**
 * Кнопки накладки: «видел» (или «снова подсвечивать») и «Ask AI» с выбором чата. compact -
 * значками в строке списка, иначе - кнопками с подписью в плашке накладки карточки встречи:
 * «Ask AI» там в тоне плашки (красной, жёлтой или спокойной), а не серым пятном.
 */
export const OverlapActions = ({ overlapKey, seen, compact = false }: OverlapActionsProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const { targets, canAsk, ask, mark } = useOverlapActions(overlapKey)
  const markLabel = t(seen ? 'calendar.overlaps.unmark' : 'calendar.overlaps.mark')
  const askLabel = t('calendar.overlaps.ask')

  const handleAsk = (provider: (typeof targets)[number]['provider']) => {
    popover.close()
    ask(provider)
  }

  return (
    <div className={styles.actions}>
      {compact ? (
        <>
          <IconButton
            icon={seen ? Undo2 : CheckCheck}
            label={markLabel}
            size="xs"
            onClick={() => mark(!seen)}
          />
          <IconButton {...popover.triggerProps} icon={Sparkles} label={askLabel} size="xs" />
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            icon={seen ? Undo2 : CheckCheck}
            onClick={() => mark(!seen)}>
            {markLabel}
          </Button>
          <Button {...popover.triggerProps} variant="tinted" size="sm" icon={Sparkles} menu>
            {askLabel}
          </Button>
        </>
      )}
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={t('calendar.overlaps.askWith')} autoFocus>
            {targets.map(({ provider, missing }) => (
              <MenuItem
                key={provider}
                icon={PROVIDER_ICONS[provider]}
                label={t(PROVIDER_LABEL_KEYS[provider])}
                description={
                  !canAsk
                    ? t('calendar.overlaps.noProject')
                    : missing
                      ? t('common.notInstalled')
                      : undefined
                }
                wrapDescription={!canAsk}
                disabled={!canAsk || missing}
                onSelect={() => handleAsk(provider)}
              />
            ))}
          </Menu>
        )}
      </Popover>
    </div>
  )
}
