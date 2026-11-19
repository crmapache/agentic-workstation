import { randomUUID } from 'node:crypto'

import type {
  ExtensionDialog,
  ExtensionDialogAnswer,
  ExtensionDialogRequest,
} from '@shared/extension-ui'
import type { ExtensionEditorAsk } from '@shared/ipc/extensions.contract'

/** Сколько главный процесс ждёт ответа окна о редакторе. */
const EDITOR_ANSWER_MS = 5000

type WindowSend = {
  dialog: (request: ExtensionDialogRequest) => void
  dialogClosed: (requestId: string) => void
  editorAsk: (ask: ExtensionEditorAsk) => void
}

type HeldDialog = {
  extensionId: string
  dialog: ExtensionDialog
  resolve: (answer: ExtensionDialogAnswer) => void
}
type HeldEditor = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

/** Ответ окна на вопрос - того вида, что спрашивали: остальное - как «закрыл без ответа». */
const answerFor = (
  dialog: ExtensionDialog,
  answer: ExtensionDialogAnswer,
): ExtensionDialogAnswer => {
  switch (dialog.kind) {
    case 'prompt':
      return typeof answer === 'string' ? answer.slice(0, 100_000) : null
    case 'confirm':
      return answer === true
    case 'pick':
      return typeof answer === 'string' && dialog.items.some((item) => item.value === answer)
        ? answer
        : null
  }
}

/**
 * Вопросы главного процесса окну от имени расширений (ADR 0091): диалог человеку ждёт без
 * срока, вопрос о редакторе - не дольше EDITOR_ANSWER_MS. Остановка расширения снимает его
 * диалоги ответом «без ответа».
 */
export class WindowAsks {
  private readonly dialogs = new Map<string, HeldDialog>()
  private readonly editors = new Map<string, HeldEditor>()

  constructor(private readonly send: WindowSend) {}

  dialog(
    extensionId: string,
    extensionName: string,
    dialog: ExtensionDialog,
  ): Promise<ExtensionDialogAnswer> {
    return new Promise((resolve) => {
      const requestId = randomUUID()

      this.dialogs.set(requestId, { extensionId, dialog, resolve })
      this.send.dialog({ requestId, extensionId, extensionName, dialog })
    })
  }

  /** Вопросы, которые ждут: окну, которое поднялось позже. */
  pendingDialogs(names: (extensionId: string) => string): ExtensionDialogRequest[] {
    return [...this.dialogs].map(([requestId, held]) => ({
      requestId,
      extensionId: held.extensionId,
      extensionName: names(held.extensionId),
      dialog: held.dialog,
    }))
  }

  answerDialog(requestId: string, answer: ExtensionDialogAnswer): void {
    const held = this.dialogs.get(requestId)

    this.dialogs.delete(requestId)
    held?.resolve(answerFor(held.dialog, answer))
  }

  closeDialogsOf(extensionId: string): void {
    for (const [requestId, held] of this.dialogs) {
      if (held.extensionId !== extensionId) continue

      this.dialogs.delete(requestId)
      held.resolve(held.dialog.kind === 'confirm' ? false : null)
      this.send.dialogClosed(requestId)
    }
  }

  editor(ask: Omit<ExtensionEditorAsk, 'requestId'>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const requestId = randomUUID()
      const timer = setTimeout(() => {
        this.editors.delete(requestId)
        reject(new Error('The IDE window did not answer about the editor.'))
      }, EDITOR_ANSWER_MS)

      this.editors.set(requestId, { resolve, reject, timer })
      this.send.editorAsk({ ...ask, requestId })
    })
  }

  answerEditor(requestId: string, answer: unknown): void {
    const held = this.editors.get(requestId)

    if (!held) return

    this.editors.delete(requestId)
    clearTimeout(held.timer)

    if (
      typeof answer === 'object' &&
      answer !== null &&
      'error' in answer &&
      typeof answer.error === 'string'
    ) {
      held.reject(new Error(answer.error))
    } else {
      held.resolve(answer ?? null)
    }
  }

  dispose(): void {
    for (const held of this.dialogs.values())
      held.resolve(held.dialog.kind === 'confirm' ? false : null)

    for (const held of this.editors.values()) {
      clearTimeout(held.timer)
      held.reject(new Error('The IDE is closing.'))
    }

    this.dialogs.clear()
    this.editors.clear()
  }
}
