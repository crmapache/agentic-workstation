import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@agentic-workstation/ui/Modal'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { useSettingsStore } from '../settings.store'
import { SETTINGS_SECTIONS } from './SettingsDialog.constants'
import { AppearancePane } from './parts/AppearancePane'
import { SoundsPane } from './parts/SoundsPane'

/**
 * Настройки IDE (⌘,, Settings… в меню программы, шестерёнка внизу левой полосы, действие
 * поиска): широкое окно во всю высоту, слева меню разделов, справа раздел - строками
 * настроек. Разделов будет больше: новый - пункт в SETTINGS_SECTIONS и свой вид. Всё
 * меняется сразу, подтверждать нечего; окно под настройками не темнеет - размер текста
 * видно на самой IDE.
 */
export const SettingsDialog = () => {
  const { t } = useTranslation()
  const isOpen = useSettingsStore((state) => state.isOpen)
  const section = useSettingsStore((state) => state.section)
  const close = useSettingsStore((state) => state.close)
  const showSection = useSettingsStore((state) => state.showSection)
  const items = SETTINGS_SECTIONS.map(({ id, icon }) => ({
    id,
    icon,
    label: t(`settings.sections.${id}`),
  }))

  return (
    <Modal
      open={isOpen}
      size="lg"
      tall
      icon={Settings}
      title={t('settings.title')}
      backdrop="clear"
      closeLabel={t('common.close')}
      aside={
        <Tabs
          label={t('settings.sectionsLabel')}
          orientation="vertical"
          items={items}
          value={section}
          onChange={showSection}
        />
      }
      onClose={close}>
      {section === 'appearance' ? <AppearancePane /> : <SoundsPane />}
    </Modal>
  )
}
