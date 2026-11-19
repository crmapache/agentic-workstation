import { Badge } from '@agentic-workstation/ui/Badge'

import { BADGE_TONES } from '../ExtensionSurface.constants'
import { useSurface } from '../ExtensionSurface.context'
import styles from '../ExtensionSurface.module.scss'
import type { NodeProps } from '../ExtensionSurface.types'
import { extensionIcon } from '../../../../lib/extension-icons'
import { ListRowBody } from './ListRowBody'

/**
 * Список строк: иконка, заголовок, пояснение и плашка справа. Строка с действием нажимается
 * и шлёт его расширению; без действия - просто строка.
 */
export const ListNode = ({ node }: NodeProps<'list'>) => {
  const surface = useSurface()

  return (
    <ul className={styles.list}>
      {node.items.map((item) => {
        const Icon = item.icon ? extensionIcon(item.icon) : null
        const badge = item.badge && (
          <Badge tone={BADGE_TONES[item.badge.tone ?? 'default']}>{item.badge.text}</Badge>
        )
        const body = (
          <ListRowBody
            icon={Icon}
            title={item.title}
            description={item.description}
            badge={badge}
          />
        )
        const { action } = item

        return (
          <li key={item.id}>
            {action ? (
              <button
                type="button"
                className={styles.listButton}
                onClick={() => surface.act(action)}>
                {body}
              </button>
            ) : (
              <div className={styles.listRow}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
