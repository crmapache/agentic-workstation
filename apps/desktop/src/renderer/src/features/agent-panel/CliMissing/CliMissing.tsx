import { RotateCw, SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { useCliNeed, usePanelCapabilities } from '../panel.queries'
import { CodeBlock } from '../CodeBlock/CodeBlock'
import { GIT_BASH_INSTALL, INSTALL_COMMANDS, INSTALL_LANGUAGE } from './CliMissing.constants'
import { useCliRecheck } from './CliMissing.hooks'
import styles from './CliMissing.module.scss'
import { CliPathForm } from './parts/CliPathForm'

/**
 * CLI провайдера не нашёлся (как в ACC): «не нашёлся» и «не установлен» - не одно и то же,
 * IDE видит не тот PATH, что терминал. Поэтому команда установки, поле пути к CLI с «Use
 * this» (главный процесс проверит, что это Claude Code), список мест, где панель искала,
 * и «Check again». Поле и список - если путь руками умеет провайдер. CLI на месте, но ему не
 * хватает Git Bash (Kimi на Windows) - тот же экран про Git for Windows: ставить надо его.
 */
export const CliMissing = () => {
  const { t } = useTranslation()
  const { provider, cliPath: hasPath } = usePanelCapabilities()
  const recheck = useCliRecheck(hasPath)
  const needsGitBash = useCliNeed() === 'git-bash'
  const text = hasPath ? t('agentPanel.cliPath.text') : t('agentPanel.cliMissingText')

  return (
    <EmptyState
      icon={SquareTerminal}
      title={needsGitBash ? t('agentPanel.gitBashMissingTitle') : t('agentPanel.cliMissingTitle')}
      description={needsGitBash ? t('agentPanel.gitBashMissingText') : text}
      action={
        <div className={styles.action}>
          <CodeBlock
            compact
            code={needsGitBash ? GIT_BASH_INSTALL : INSTALL_COMMANDS[provider]}
            language={INSTALL_LANGUAGE}
          />
          {hasPath && <CliPathForm />}
          <Button variant="ghost" icon={RotateCw} onClick={recheck}>
            {t('agentPanel.checkAgain')}
          </Button>
        </div>
      }
    />
  )
}
