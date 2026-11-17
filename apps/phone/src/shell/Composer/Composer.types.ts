import type { ReactNode } from 'react'

import type { OutgoingMessage } from '../../lib/attachments'

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
  /** true - ушло, поле, цитаты и вложения очищаются; false - осталось как было. */
  onSend: (message: OutgoingMessage) => Promise<boolean>
}
