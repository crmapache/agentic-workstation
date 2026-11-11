import { useState } from 'react'
import { Trash2, SquareTerminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { Modal } from '@agentic-workstation/ui/Modal'
import type { ModalSize } from '@agentic-workstation/ui/Modal.types'
import { Switch } from '@agentic-workstation/ui/Switch'

import { Specimen } from '../../Specimen/Specimen'

/**
 * Окно с содержимым двух ширин: шапка с иконкой, состоянием и переключателем без подписи,
 * подвал с удалением. Живое - закрывается крестиком, Esc и щелчком мимо.
 */
export const ModalSpecimen = () => {
  const { t } = useTranslation('showcase')
  const [modalSize, setModalSize] = useState<ModalSize | null>(null)
  const [isModalOn, setIsModalOn] = useState(true)

  const closeModal = () => setModalSize(null)

  return (
    <Specimen label={t('specimens.modal')}>
      <Button variant="secondary" onClick={() => setModalSize('md')}>
        {t('samples.openModal')}
      </Button>
      <Button variant="secondary" onClick={() => setModalSize('lg')}>
        {t('samples.openWideModal')}
      </Button>
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
