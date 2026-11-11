import { Import } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Spinner } from '@agentic-workstation/ui/Spinner'
import { Switch } from '@agentic-workstation/ui/Switch'

import { useImportPanel } from '../ConnectorsView.hooks'
import styles from '../ConnectorsView.module.scss'
import type { ImportPanelProps } from '../ConnectorsView.types'
import { isRenamed, importScope } from '../ConnectorsView.utils'

/**
 * Перенос MCP-серверов из конфига Claude Code (ADR 0029): у Claude в IDE других MCP нет.
 * Сервер, которого не взять (имя занято, повтор, имя без латиницы), не выбирается; новое
 * имя, вход заново и неодобренный сервер проекта подписаны. Серверы .mcp.json по
 * умолчанию не отмечены: их принёс репозиторий. Итог - сколько перенесено и что
 * пропущено с причиной.
 */
export const ImportPanel = ({ onDone }: ImportPanelProps) => {
  const { t } = useTranslation()
  const panel = useImportPanel()
  const { candidates, result } = panel

  if (result) {
    return (
      <div className={styles.form}>
        <p className={styles.hint}>
          {t('connectors.import.done', { count: result.imported })}
          {result.skipped.length > 0 &&
            ` ${t('connectors.import.skipped', {
              names: result.skipped
                .map(({ name, reason }) => `${name} (${t(`connectors.import.reasons.${reason}`)})`)
                .join(', '),
            })}`}
        </p>
        <div className={styles.formActions}>
          <Button size="sm" onClick={onDone}>
            {t('connectors.import.close')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.form}>
      {panel.isBusy && (
        <div className={styles.buttons}>
          <Spinner size="sm" tone="neutral" />
          <span className={styles.hint}>{t('connectors.import.loading')}</span>
        </div>
      )}
      {!panel.isBusy && candidates?.length === 0 && (
        <p className={styles.hint}>{t('connectors.import.none')}</p>
      )}
      {candidates?.map((candidate) => {
        const scope = importScope(candidate)
        const notes = [
          t(`connectors.import.scopes.${scope.key}`, { name: scope.project }),
          candidate.blocked ? t(`connectors.import.blocked.${candidate.blocked}`) : '',
          isRenamed(candidate)
            ? t('connectors.import.renamed', { name: candidate.serverName })
            : '',
          candidate.pending ? t('connectors.import.pending') : '',
          candidate.needsSignIn ? t('connectors.import.signIn') : '',
        ].filter(Boolean)

        return (
          <Switch
            key={candidate.key}
            label={candidate.name}
            description={`${candidate.target} · ${notes.join(' · ')}`}
            checked={panel.chosen.has(candidate.key)}
            disabled={Boolean(candidate.blocked) || panel.isBusy}
            onChange={(on) => panel.toggle(candidate.key, on)}
          />
        )
      })}
      <div className={styles.formActions}>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('connectors.add.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={Import}
          disabled={panel.isBusy || panel.chosen.size === 0}
          onClick={panel.submit}>
          {t('connectors.import.submit', { count: panel.chosen.size })}
        </Button>
      </div>
    </div>
  )
}
