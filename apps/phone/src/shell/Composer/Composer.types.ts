import type { ReactNode } from 'react'

import type { PreparedImage } from '../../lib/images'

export type ComposerProps = {
  /** Чей черновик: разговор или прогон. */
  draftKey: string
  placeholder: string
  sendLabel: string
  /** Можно ли приложить фото. */
  allowImages?: boolean | undefined
  disabled?: boolean | undefined
  /** Перед «отправить», в том же ряду: Stop идущего хода - под большим пальцем, как в IDE. */
  actions?: ReactNode | undefined
  /** true - ушло, поле очищается; false - осталось как было. */
  onSend: (text: string, images: PreparedImage[]) => Promise<boolean>
}
