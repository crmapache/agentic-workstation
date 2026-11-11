import { useState } from 'react'
import { Trash2, Settings, SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Modal } from '@agentic-workstation/ui/Modal'
import type { ModalSize } from '@agentic-workstation/ui/Modal.types'
import { Switch } from '@agentic-workstation/ui/Switch'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { Specimen } from '../../Specimen/Specimen'

/**
 * Окно с содержимым двух ширин: шапка с иконкой, состоянием и переключателем без подписи,
 * подвал с удалением; и окно с разделами - во всю высоту, меню слева (как настройки IDE).
 * Живое - закрывается крестиком, Esc и щелчком мимо.
 */
export const ModalSpecimen = () => {
  const { t } = useTranslation('showcase')
  const [modalSize, setModalSize] = useState<ModalSize | null>(null)
  const [isModalOn, setIsModalOn] = useState(true)
  const [section, setSection] = useState<string | null>(null)

  const closeModal = () => setModalSize(null)
  const sections = [
    { id: 'overview', label: t('samples.overview') },
    { id: 'changes', label: t('samples.changes') },
    { id: 'history', label: t('samples.history') },
  ]

  return (
    <Specimen label={t('specimens.modal')}>
      <Button variant="secondary" onClick={() => setModalSize('md')}>
        {t('samples.openModal')}
      </Button>
      <Button variant="secondary" onClick={() => setModalSize('lg')}>
        {t('samples.openWideModal')}
      </Button>
      <Button variant="secondary" onClick={() => setSection('overview')}>
        {t('samples.openSectionsModal')}
      </Button>
      {section && (
        <Modal
          open
          size="lg"
          tall
          icon={Settings}
          title={t('samples.settings')}
          aside={
            <Tabs
              label={t('samples.tabsLabel')}
              items={sections}
              value={section}
              orientation="vertical"
              onChange={setSection}
            />
          }
          closeLabel={t('samples.close')}
          onClose={() => setSection(null)}>
          {t('samples.modalBody')}
        </Modal>
      )}
      {modalSize && (
        <Modal
          open
          size={modalSize}
          icon={SquareTerminal}
          title={t('samples.modalTitle')}
          description={t('samples.modalDescription')}
          headerActions={
            <>
              <Badge tone="success">{t('samples.active')}</Badge>
              <Switch
                label={t('samples.enabled')}
                labelHidden
                checked={isModalOn}
                onChange={setIsModalOn}
              />
            </>
          }
          footer={
            <Button variant="danger" size="sm" icon={Trash2} onClick={closeModal}>
              {t('samples.remove')}
            </Button>
          }
          closeLabel={t('samples.close')}
          onClose={closeModal}>
          {t('samples.modalBody')}
        </Modal>
      )}
    </Specimen>
  )
}
