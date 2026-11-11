import { Bot, Copy, Check, SquareArrowOutUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { AgentApp } from '@shared/connectors'

import { Button } from '@agentic-workstation/ui/Button'
import { useCopied } from '@agentic-workstation/ui/CodeSnippet.hooks'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'
import { Popover } from '@agentic-workstation/ui/Popover'
import { usePopover } from '@agentic-workstation/ui/Popover.hooks'

import type { GoogleSetupMenuProps } from '../ConnectorsView.types'
import { useAgentApps, useConnectorActions } from '../../../../state/connectors.queries'

/**
 * «Set up with AI»: шаги в Google Cloud Console делает ИИ в браузере человека. Claude и Codex -
 * новый разговор в их приложении с промптом в поле ввода, отправляет человек; в списке только
 * установленные. Копия промпта - для любого другого ИИ.
 */
export const GoogleSetupMenu = ({ onOpenFailed }: GoogleSetupMenuProps) => {
  const { t } = useTranslation()
  const popover = usePopover()
  const apps = useAgentApps()
  const actions = useConnectorActions()
  const copied = useCopied()
  const prompt = t('connectors.google.agentPrompt')
  const installed = apps.data ?? []

  const handleOpen = async (app: AgentApp) => {
    popover.close()
    onOpenFailed((await actions.openInAgentApp(app, prompt)) ? null : app)
  }

  const handleCopy = () => {
    popover.close()
    copied.copy(prompt)
  }

  return (
    <>
      <Button {...popover.triggerProps} size="sm" icon={copied.isCopied ? Check : Bot} menu>
        {t(copied.isCopied ? 'connectors.google.promptCopied' : 'connectors.google.setUpWithAi')}
      </Button>
      <Popover {...popover.popoverProps}>
        {popover.isOpen && (
          <Menu label={t('connectors.google.setUpWithAi')} autoFocus>
            {installed.map((app) => (
              <MenuItem
                key={app}
                icon={SquareArrowOutUpRight}
                label={t('connectors.google.openIn', { app: t(`connectors.agentApps.${app}`) })}
                onSelect={() => void handleOpen(app)}
              />
            ))}
            {installed.length > 0 && <MenuSeparator />}
            <MenuItem icon={Copy} label={t('connectors.google.copyPrompt')} onSelect={handleCopy} />
          </Menu>
        )}
      </Popover>
    </>
  )
}
