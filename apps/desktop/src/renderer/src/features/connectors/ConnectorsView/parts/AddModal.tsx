import { Import } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isCustomKind } from '@shared/connectors'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'

import { KIND_ICONS, KIND_TONES } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { AddModalProps } from '../ConnectorsView.types'
import { useConnectorsStore } from '../../connectors.store'
import { useConnectorActions } from '../../../../state/connectors.queries'
import { AddConnectorForm } from './AddConnectorForm'
import { AiConnectorFlow } from './AiConnectorFlow'
import { GoogleAppCard } from './GoogleAppCard'
import { ImportPanel } from './ImportPanel'

/**
 * Новый коннектор окном по центру: форма выбранного типа, работа ИИ или перенос из Claude
 * Code. У Gmail и Calendar сверху - свой клиент Google: без него им не войти. Добавлен -
 * окно сразу показывает новый коннектор (там идёт вход). Крестик работу ИИ не трогает:
 * она дождётся в каталоге.
 */
export const AddModal = ({ target, google, generation }: AddModalProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const close = useConnectorsStore((store) => store.close)
  const openConnector = useConnectorsStore((store) => store.openConnector)
  const isImport = target === 'import'
  // «Create with AI» уже действие - «Add» к нему не приставляется.
  const title = isImport
    ? t('connectors.import.title')
    : target === 'http'
      ? t('connectors.kinds.http.name')
      : t('connectors.add.sheetTitle', { name: t(`connectors.kinds.${target}.name`) })
  // Пояснение типа - в «?» шапки; у встроенного - ещё и зачем подпись, у своего - имя и
  // «несколько раз» (ADR 0034).
  const nameHelp =
    !isImport && isCustomKind(target) ? 'connectors.help.add.custom' : 'connectors.help.add.name'
  const helpText = [t(`connectors.help.add.${target}`), isImport ? '' : t(nameHelp)]
    .filter(Boolean)
    .join('\n\n')

  const handleAdded = (id: string | null) => (id ? openConnector(id) : close())

  // Отказ ИИ забывается с уходом из формы; готовое описание и идущая работа - нет.
  const handleCancelAi = () => {
    if (generation.status === 'failed') actions.dismissGeneration()

    close()
  }

  return (
    <Modal
      open
      icon={isImport ? Import : KIND_ICONS[target]}
      iconTone={isImport ? 'neutral' : KIND_TONES[target]}
      title={title}
      description={
        isImport ? t('connectors.import.tileHint') : t(`connectors.kinds.${target}.hint`)
      }
      headerActions={
        <HelpButton
          label={t('connectors.help.label')}
          title={title}
          text={helpText}
          closeLabel={t('connectors.modal.close')}
        />
      }
      closeLabel={t('connectors.modal.close')}
      onClose={close}>
      <div className={styles.addBody}>
        {(target === 'gmail' || target === 'calendar') && <GoogleAppCard google={google} />}
        {isImport && <ImportPanel onDone={close} />}
        {target === 'http' && (
          <AiConnectorFlow
            generation={generation}
            onAdded={handleAdded}
            onCancel={handleCancelAi}
          />
        )}
        {!isImport && target !== 'http' && (
          <AddConnectorForm
            key={target}
            kind={target}
            googleReady={google.configured}
            onAdded={handleAdded}
            onCancel={close}
          />
        )}
      </div>
    </Modal>
  )
}
