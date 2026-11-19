import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../StorePage.module.scss'
import type { UpdatesSectionProps } from '../StorePage.types'
import { useStoreActions } from '../../store.actions'

/** Обновления поставленного из магазина: строкой на расширение и кнопкой «обновить». */
export const UpdatesSection = ({ updates, installed }: UpdatesSectionProps) => {
  const { t } = useTranslation()
  const actions = useStoreActions()
  const [busy, setBusy] = useState<string | null>(null)

  const handleUpdate = async (id: string) => {
    setBusy(id)
    await actions.install(id, null)
    setBusy(null)
  }

  if (updates.length === 0) return null

  return (
    <Section title={t('extensions.store.updates')} count={updates.length}>
      <div className={styles.updates}>
        {updates.map((update) => (
          <div key={update.id} className={styles.update}>
            <span className={styles.updateText}>
              <span className={styles.updateName}>
                {installed.extensions.find((item) => item.id === update.id)?.manifest?.name ??
                  update.id}
              </span>
              <span className={styles.updateVersions}>
                {t('extensions.store.upgrade', { from: update.installed, to: update.latest })}
              </span>
            </span>
            <Button
              size="sm"
              variant="primary"
              disabled={busy !== null}
              onClick={() => void handleUpdate(update.id)}>
              {t('extensions.store.update', { version: update.latest })}
            </Button>
          </div>
        ))}
      </div>
    </Section>
  )
}
