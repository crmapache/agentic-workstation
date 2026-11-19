import type { ModelConnection, ModelConnectionKind } from '@shared/open-models'

/** Что правят в диалоге: новое подключение (id нет) или своё добавленное. */
export type ConnectionDraft = {
  id: string | null
  kind: ModelConnectionKind
  label: string
  baseUrl: string
  /** Есть ли сохранённый ключ: пустое поле его не трогает. */
  hasKey: boolean
}

export type ConnectionCardProps = {
  connection: ModelConnection
  busy: boolean
  onCheck: () => void
  onEdit: (connection: ModelConnection) => void
  onRemove: (connection: ModelConnection) => void
}

export type ConnectionDialogProps = {
  draft: ConnectionDraft | null
  canStoreKeys: boolean
  /** Прошлое сохранение не прошло: слова сбоя в диалоге. */
  failed: boolean
  onSave: (draft: ConnectionDraft, key: string | null | undefined) => void
  onClose: () => void
}

export type RemoveDialogProps = {
  connection: ModelConnection | null
  onConfirm: () => void
  onClose: () => void
}
