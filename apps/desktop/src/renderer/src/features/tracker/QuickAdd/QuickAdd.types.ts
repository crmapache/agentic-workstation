export type QuickAddProps = {
  placeholder: string
  /** Новое имя: создать и оставить поле открытым для следующего. */
  onAdd: (title: string) => Promise<boolean>
  onClose: () => void
}
