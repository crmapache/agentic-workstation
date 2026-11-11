import { useTranslation } from 'react-i18next'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'

import { KIND_ICONS, KIND_TONES } from '../ConnectorsView.constants'
import type { TypePartProps } from '../ConnectorsView.types'
import { useConnectorsStore } from '../../connectors.store'
import { AddToTypeForm } from './AddToTypeForm'
import { RemoveType } from './RemoveType'

/**
 * Свой тип из каталога (ADR 0034) окном по центру: ещё одно подключение - как новый Gmail,
 * а в подвале справа - удаление типа, которого у встроенных нет. Добавлено - окно сразу
 * показывает новое подключение.
 */
export const TypeModal = ({ type, connections }: TypePartProps) => {
  const { t } = useTranslation()
  const close = useConnectorsStore((store) => store.close)
  const openConnector = useConnectorsStore((store) => store.openConnector)
  const title = t('connectors.add.sheetTitle', { name: type.name })

  const handleAdded = (id: string | null) => (id ? openConnector(id) : close())

  return (
    <Modal
      open
      icon={KIND_ICONS[type.kind]}
      iconTone={KIND_TONES[type.kind]}
      title={title}
      description={type.detail}
      headerActions={
        <HelpButton
          label={t('connectors.help.label')}
          title={t('connectors.help.type.title')}
          text={[t('connectors.help.type.text'), t('connectors.help.add.name')].join('\n\n')}
          closeLabel={t('connectors.modal.close')}
        />
      }
      footer={<RemoveType type={type} connections={connections} />}
      closeLabel={t('connectors.modal.close')}
      onClose={close}>
      <AddToTypeForm type={type} onAdded={handleAdded} onCancel={close} />
    </Modal>
  )
}
