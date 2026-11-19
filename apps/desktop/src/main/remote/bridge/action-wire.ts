import type { ToolAction } from '@shared/conversation-feed'

import type { FeedItemWire, ToolActionWire } from '@agentic-workstation/remote-protocol/wire-types'

/**
 * Вид действия вызова - телефону (ADR 0083): по нему он рисует строку вызова и вопрос
 * разрешения у любого провайдера, а не по именам инструментов Claude Code. Без диффа по входу
 * (preview): правка и так едет своим результатом, а второй её дифф удвоил бы правку в кадре и
 * раньше времени гнал бы её в карточку.
 */
export const actionWire = (action: ToolAction): ToolActionWire => {
  switch (action.kind) {
    case 'edit':
      return { kind: 'edit', path: action.path }
    case 'write':
      return { kind: 'write', path: action.path, lines: action.lines }
    default:
      return action
  }
}

/**
 * Элемент ленты с видом действия для телефона. Вид есть только у вызова инструмента; лента
 * собрана IDE, так что поле - её ToolAction.
 */
export const itemForPhone = (item: FeedItemWire): FeedItemWire =>
  item.kind === 'tool' && typeof item['action'] === 'object' && item['action'] !== null
    ? { ...item, action: actionWire(item['action'] as ToolAction) }
    : item
