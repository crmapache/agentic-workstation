export type ScenarioConfirmProps = {
  open: boolean
  /** Вопрос: «Delete this scenario?». */
  title: string
  /** Что именно уходит - имя сценария, прогона, часа; пусто - не показывать. */
  subject: string
  /** Что будет после ответа «да» и что останется. */
  note: string
  /** Подпись кнопки «да» - глаголом: Delete, Discard. */
  submit: string
  onSubmit: () => void
  onClose: () => void
}
