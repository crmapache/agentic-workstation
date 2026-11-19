import type { ExtensionDialog } from '@shared/extension-ui'

/** С чего начинается ответ: текст из вопроса, у выбора - первый пункт. */
export const initialValue = (dialog: ExtensionDialog): string =>
  dialog.kind === 'prompt'
    ? dialog.value
    : dialog.kind === 'pick'
      ? (dialog.items[0]?.value ?? '')
      : ''
