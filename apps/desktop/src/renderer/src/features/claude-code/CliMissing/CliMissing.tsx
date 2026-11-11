import { useState } from 'react'
import type { FormEvent } from 'react'
import { RotateCw, SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { TextField } from '@agentic-workstation/ui/TextField'

import { CodeBlock } from '../CodeBlock/CodeBlock'
import { INSTALL_COMMAND, PATH_PLACEHOLDER } from './CliMissing.constants'
import { useCliPath } from './CliMissing.hooks'
import styles from './CliMissing.module.scss'

/**
 * Claude Code не нашёлся (как в ACC): «не нашёлся» и «не установлен» - не одно и то же,
 * IDE видит не тот PATH, что терминал. Поэтому команда установки, поле пути к CLI с «Use
 * this» (главный процесс проверит, что это Claude Code), список мест, где панель искала,
 * и «Check again».
 */
export const CliMissing = () => {
  const { t } = useTranslation()
  const cliPath = useCliPath()
  const [isListOpen, setIsListOpen] = useState(false)
  const searched = cliPath.search?.searched ?? []
  const rejected = cliPath.search?.rejected ?? null

  const handleToggleList = () => setIsListOpen((open) => !open)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    cliPath.use()
  }

  return (
    <EmptyState
      icon={SquareTerminal}
      title={t('claudeCode.cliMissingTitle')}
      description={t('claudeCode.cliPath.text')}
      action={
        <div className={styles.action}>
          <CodeBlock compact code={INSTALL_COMMAND} language="bash" />
          <form className={styles.pathRow} onSubmit={handleSubmit}>
            <TextField
              label={t('claudeCode.cliPath.label')}
              hideLabel
              value={cliPath.path}
              placeholder={PATH_PLACEHOLDER}
              spellCheck={false}
              error={rejected ? t(`claudeCode.cliPath.rejected.${rejected}`) : undefined}
              onChange={cliPath.setPath}
            />
            <Button type="submit" disabled={cliPath.isBusy}>
              {t('claudeCode.cliPath.use')}
            </Button>
          </form>
          {searched.length > 0 && (
            <div className={styles.searched}>
              <Disclosure size="sm" expanded={isListOpen} onClick={handleToggleList}>
                {t('claudeCode.cliPath.whereLooked')}
              </Disclosure>
              {isListOpen && (
                <ul className={styles.places}>
                  {searched.map((place) => (
                    <li key={place}>{place}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <Button variant="ghost" icon={RotateCw} onClick={cliPath.recheck}>
            {t('claudeCode.checkAgain')}
          </Button>
        </div>
      }
    />
  )
}
