import type { ExtensionDialogRequest } from '@shared/extension-ui'

export type DialogBodyProps = {
  request: ExtensionDialogRequest
  value: string
  onValue: (value: string) => void
}

export type AskedDialogProps = { request: ExtensionDialogRequest }
