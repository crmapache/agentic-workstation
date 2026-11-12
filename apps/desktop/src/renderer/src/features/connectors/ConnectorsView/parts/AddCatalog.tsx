import { Import } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CUSTOM_KINDS } from '@shared/connectors'
import type { ConnectorKind } from '@shared/connectors'

import { Section } from '@agentic-workstation/ui/Section'
import { Tile } from '@agentic-workstation/ui/Tile'

import { APP_KINDS, KIND_ICONS, KIND_TONES } from '../ConnectorsView.constants'
import styles from '../ConnectorsView.module.scss'
import type { AddCatalogProps } from '../ConnectorsView.types'
import { useConnectorsStore } from '../../connectors.store'
import type { AddTarget } from '../../connectors.types'

/**
 * Каталог нового коннектора под подключёнными, двумя группами плиток с пунктирной рамкой:
 * приложения (Gmail, Notion… и свои типы «несколько раз» с меткой Custom, ADR 0034) и свои
 * способы добавить - сервер по адресу, команда, коннектор от ИИ, перенос из Claude Code.
 * Нажатие открывает форму окном по центру. Работы ИИ - своей очередью над подключёнными.
 */
export const AddCatalog = ({ types }: AddCatalogProps) => {
  const { t } = useTranslation()
  const panel = useConnectorsStore((store) => store.panel)
  const openAdd = useConnectorsStore((store) => store.openAdd)
  const openType = useConnectorsStore((store) => store.openType)
  const isOpen = (target: AddTarget) => panel?.kind === 'add' && panel.target === target

  const kindTile = (kind: ConnectorKind) => (
    <Tile
      key={kind}
      variant="dashed"
      icon={KIND_ICONS[kind]}
      iconTone={KIND_TONES[kind]}
      title={t(`connectors.kinds.${kind}.name`)}
      description={t(`connectors.kinds.${kind}.hint`)}
      wrapDescription
      selected={isOpen(kind)}
      onClick={() => openAdd(kind)}
    />
  )

  return (
    <Section title={t('connectors.add.title')}>
      <div className={styles.catalog}>
        <Section size="sm" title={t('connectors.add.groups.apps')}>
          <div className={styles.grid}>
            {APP_KINDS.map(kindTile)}
            {types
              .filter((type) => type.multiple)
              .map((type) => (
                <Tile
                  key={type.id}
                  variant="dashed"
                  icon={KIND_ICONS[type.kind]}
                  iconTone={KIND_TONES[type.kind]}
                  title={type.name}
                  description={[t('connectors.types.badge'), type.detail].join(' · ')}
                  selected={panel?.kind === 'type' && panel.id === type.id}
                  onClick={() => openType(type.id)}
                />
              ))}
          </div>
        </Section>
        <Section size="sm" title={t('connectors.add.groups.custom')}>
          <div className={styles.grid}>
            {CUSTOM_KINDS.map(kindTile)}
            <Tile
              variant="dashed"
              icon={Import}
              title={t('connectors.import.title')}
              description={t('connectors.import.tileHint')}
              wrapDescription
              selected={isOpen('import')}
              onClick={() => openAdd('import')}
            />
          </div>
        </Section>
      </div>
    </Section>
  )
}
