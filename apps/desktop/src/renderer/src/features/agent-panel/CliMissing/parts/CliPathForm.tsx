import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Disclosure } from '@agentic-workstation/ui/Disclosure'
import { TextField } from '@agentic-workstation/ui/TextField'

import { PATH_PLACEHOLDER } from '../CliMissing.constants'
import { useCliPath } from '../CliMissing.hooks'
import styles from '../CliMissing.module.scss'

/** Поле пути к CLI с «Use this» и список мест, где панель искала, - у провайдера с путём руками. */
export const CliPathForm = () => {
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
    <>
      <form className={styles.pathRow} onSubmit={handleSubmit}>
        <TextField
          label={t('agentPanel.cliPath.label')}
          hideLabel
          value={cliPath.path}
          placeholder={PATH_PLACEHOLDER}
          spellCheck={false}
          error={rejected ? t(`agentPanel.cliPath.rejected.${rejected}`) : undefined}
          onChange={cliPath.setPath}
        />
        <Button type="submit" disabled={cliPath.isBusy}>
          {t('agentPanel.cliPath.use')}
        </Button>
      </form>
      {searched.length > 0 && (
        <div className={styles.searched}>
          <Disclosure size="sm" expanded={isListOpen} onClick={handleToggleList}>
            {t('agentPanel.cliPath.whereLooked')}
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
    </>
  )
}
