import type { ReactNode } from 'react'

import type { SlashCommandWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import type { OutgoingMessage } from '../../lib/attachments'
import type { SlashOption } from '../../lib/slash.utils'

/**
 * Подсказка «/» поля: команды по порядку каталога и значения второго шага по имени команды
 * (/model, /effort, /fast). Нет - поле без подсказки (прогон сценария).
 */
export type ComposerSlash = {
  commands: readonly SlashCommandWire[]
  argumentSets: Readonly<Record<string, readonly SlashOption[]>>
}

export type ComposerProps = {
  /** Чей черновик (и цитаты): разговор или прогон. */
  draftKey: string
  placeholder: string
  sendLabel: string
  /** Можно ли приложить фото и файлы. */
  allowAttachments?: boolean | undefined
  disabled?: boolean | undefined
  /** В ряду под полем перед «отправить»: Stop идущего хода - под большим пальцем, как в IDE. */
  actions?: ReactNode | undefined
  slash?: ComposerSlash | undefined
  /** true - ушло, поле, цитаты и вложения очищаются; false - осталось как было. */
  onSend: (message: OutgoingMessage) => Promise<boolean>
}
