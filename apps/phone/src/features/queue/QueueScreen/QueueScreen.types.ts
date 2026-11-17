/**
 * Действие очереди, ждущее «точно?»: на телефоне любое из них легко задеть пальцем, листая
 * карточки, а очередь идёт без человека - случайная перестановка или остановка заметится поздно.
 */
export type Confirmation = {
  title: string
  text?: string | undefined
  label: string
  tone: 'danger' | 'primary'
  onConfirm: () => void
}
