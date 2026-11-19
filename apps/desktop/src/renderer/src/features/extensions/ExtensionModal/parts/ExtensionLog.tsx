import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'

import { LOG_SHOWN } from '../ExtensionModal.constants'
import styles from '../ExtensionModal.module.scss'
import type { ExtensionPartProps } from '../ExtensionModal.types'
import { logTime } from '../ExtensionModal.utils'
import { useExtensionActions } from '../../extensions.actions'
import { useExtensionLogs } from '../../../../state/extensions.queries'

/** Журнал расширения: console.* и слова движка, ошибки со стеком; новое дописывается само. */
export const ExtensionLog = ({ extension }: ExtensionPartProps) => {
  const { t } = useTranslation()
  const { data: entries = [] } = useExtensionLogs(extension.id)
  const actions = useExtensionActions()

  return (
    <Section
      size="sm"
      title={t('extensions.modal.log')}
      description={entries.length ? undefined : t('extensions.modal.logEmpty')}
      actions={
        entries.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void actions.clearLogs(extension.id)}>
            {t('extensions.modal.clearLog')}
          </Button>
        )
      }>
      {entries.length > 0 && (
        <ol className={styles.log}>
          {entries.slice(-LOG_SHOWN).map((entry, index) => (
            <li
              key={`${entry.at}:${index}`}
              className={clsx(
                styles.entry,
                entry.level === 'warn' && styles.warn,
                entry.level === 'error' && styles.error,
              )}>
              <span className={styles.time}>{logTime(entry.at)} </span>
              {entry.text}
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}
