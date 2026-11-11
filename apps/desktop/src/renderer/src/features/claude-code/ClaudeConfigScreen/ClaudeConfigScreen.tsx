import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CONFIG_GROUPS } from '@shared/claude-config'

import { Card } from '@agentic-workstation/ui/Card'

import { useClaudeConfig, useSetClaudeConfig } from '../claude-settings.queries'
import type { MenuScreenProps } from '../claude.types'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import { ScreenFailure } from '../ScreenFailure/ScreenFailure'
import styles from './ClaudeConfigScreen.module.scss'
import { settingNote, nextFailures } from './ClaudeConfigScreen.utils'
import { ConfigRow } from './parts/ConfigRow'

/**
 * Собственные настройки Claude Code - то, что в терминале меняет `/config`. Список и
 * варианты - от CLI, пишет тоже CLI; экран только рисует. Правка - одна за раз, ряды
 * стоят, пока CLI не ответит; исход решает перечитанный файл, а отказ - словами CLI под
 * рядом. Открытые разговоры новое значение подхватывают сами.
 */
export const ClaudeConfigScreen = ({ project }: MenuScreenProps) => {
  const { t } = useTranslation()
  const config = useClaudeConfig(project.id)
  const change = useSetClaudeConfig(project.id)
  const [pending, setPending] = useState<string | null>(null)
  const [failures, setFailures] = useState<Record<string, string>>({})
  const view = config.data
  const labels: Record<string, string> = t('claudeCode.claudeConfig.labels', {
    returnObjects: true,
  })
  const failed = t('claudeCode.claudeConfig.failed')

  const handleSet = async (key: string, value: string) => {
    setPending(key)

    const result = await change.mutateAsync({ key, value }).catch(() => null)

    setPending(null)
    setFailures((current) => nextFailures(current, key, result?.outcome ?? null, failed))
  }

  return (
    <PanelScreen title={t('claudeCode.menu.titles.claudeConfig.title')}>
      {config.isPending && (
        <div className={styles.empty}>{t('claudeCode.claudeConfig.loading')}</div>
      )}
      {view?.failure === 'unreadable' && (
        <div className={styles.empty}>{t('claudeCode.claudeConfig.unreadable')}</div>
      )}
      {(view?.failure === 'untrusted' || view?.failure === 'cli-not-found') && (
        <ScreenFailure
          failure={view.failure}
          detail=""
          projectId={project.id}
          onTrusted={() => void config.refetch()}
        />
      )}
      {CONFIG_GROUPS.map((group) => {
        const settings = view?.settings.filter((setting) => setting.group === group) ?? []

        return (
          settings.length > 0 && (
            <Card key={group} title={t(`claudeCode.claudeConfig.groups.${group}`)}>
              <div className={styles.rows}>
                {settings.map((setting) => (
                  <ConfigRow
                    key={setting.key}
                    setting={setting}
                    label={labels[setting.key] ?? setting.key}
                    note={settingNote(setting, pending, t)}
                    disabled={pending !== null || setting.lockedBy !== null}
                    failure={failures[setting.key]}
                    onSet={(key, value) => void handleSet(key, value)}
                  />
                ))}
              </div>
            </Card>
          )
        )
      })}
    </PanelScreen>
  )
}
