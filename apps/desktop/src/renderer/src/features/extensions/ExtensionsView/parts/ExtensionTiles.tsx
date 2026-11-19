import { useTranslation } from 'react-i18next'

import type { ExtensionInfo } from '@shared/extensions'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Tile } from '@agentic-workstation/ui/Tile'

import styles from '../ExtensionsView.module.scss'
import { extensionMeta } from '../ExtensionsView.utils'
import { STATUS_TONES } from '../../extensions.constants'
import { useExtensionsStore } from '../../extensions.store'
import { extensionIcon } from '../../../../lib/extension-icons'

/** Расширения плитками: имя, описание, что внесло, статус; подробности - окном по нажатию. */
export const ExtensionTiles = ({ extensions }: { extensions: readonly ExtensionInfo[] }) => {
  const { t } = useTranslation()
  const panel = useExtensionsStore((store) => store.panel)
  const open = useExtensionsStore((store) => store.open)

  return (
    <div className={styles.grid}>
      {extensions.map((extension) => (
        <Tile
          key={extension.id}
          icon={extensionIcon(extension.manifest?.icon)}
          iconTone={extension.status === 'running' ? 'accent' : 'neutral'}
          title={extension.manifest?.name ?? extension.id}
          description={extension.manifest?.description || extension.problem?.detail}
          meta={extensionMeta(extension, t)}
          status={
            <Badge tone={STATUS_TONES[extension.status]}>
              {t(`extensions.status.${extension.status}`)}
            </Badge>
          }
          muted={extension.status === 'disabled'}
          selected={panel?.kind === 'extension' && panel.id === extension.id}
          onClick={() => open({ kind: 'extension', id: extension.id })}
        />
      ))}
    </div>
  )
}
