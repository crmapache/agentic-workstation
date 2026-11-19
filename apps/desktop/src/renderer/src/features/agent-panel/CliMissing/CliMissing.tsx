import { RotateCw, SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { usePanelCapabilities } from '../panel.queries'
import { CodeBlock } from '../CodeBlock/CodeBlock'
import { INSTALL_COMMANDS, INSTALL_LANGUAGE } from './CliMissing.constants'
import { useCliRecheck } from './CliMissing.hooks'
import styles from './CliMissing.module.scss'
import { CliPathForm } from './parts/CliPathForm'

/**
 * CLI провайдера не нашёлся (как в ACC): «не нашёлся» и «не установлен» - не одно и то же,
 * IDE видит не тот PATH, что терминал. Поэтому команда установки, поле пути к CLI с «Use
 * this» (главный процесс проверит, что это Claude Code), список мест, где панель искала,
 * и «Check again». Поле и список - если путь руками умеет провайдер.
 */
export const CliMissing = () => {
  const { t } = useTranslation()
  const { provider, cliPath: hasPath } = usePanelCapabilities()
  const recheck = useCliRecheck(hasPath)

  return (
    <EmptyState
      icon={SquareTerminal}
      title={t('agentPanel.cliMissingTitle')}
      description={hasPath ? t('agentPanel.cliPath.text') : t('agentPanel.cliMissingText')}
      action={
        <div className={styles.action}>
          <CodeBlock compact code={INSTALL_COMMANDS[provider]} language={INSTALL_LANGUAGE} />
          {hasPath && <CliPathForm />}
          <Button variant="ghost" icon={RotateCw} onClick={recheck}>
            {t('agentPanel.checkAgain')}
          </Button>
        </div>
      }
    />
  )
}
