import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Modal } from '@agentic-workstation/ui/Modal'

import { useSettingsStore } from '../settings.store'
import styles from './SettingsDialog.module.scss'
import { AppearanceSection } from './parts/AppearanceSection'
import { SoundsSection } from './parts/SoundsSection'

/**
 * Настройки IDE (⌘,, Settings… в меню программы, действие поиска): вид - размер текста, и
 * звуки, которыми разговоры любого провайдера зовут человека (ADR 0046). Всё меняется сразу,
 * окно под настройками не темнеет: размер текста видно на самой IDE. Подтверждать нечего -
 * Done только закрывает.
 */
export const SettingsDialog = () => {
  const { t } = useTranslation()
  const isOpen = useSettingsStore((state) => state.isOpen)
  const close = useSettingsStore((state) => state.close)

  return (
    <Modal
      open={isOpen}
      icon={Settings}
      title={t('settings.title')}
      backdrop="clear"
      closeLabel={t('common.close')}
      footer={
        <div className={styles.done}>
          <Button variant="primary" onClick={close}>
            {t('settings.done')}
          </Button>
        </div>
      }
      onClose={close}>
      <div className={styles.body}>
        <AppearanceSection />
        <SoundsSection />
      </div>
    </Modal>
  )
}
