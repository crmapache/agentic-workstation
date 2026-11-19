import type { PermissionMode, ModeAvailability } from '@shared/conversation'
import { isModeOff } from '@shared/conversation'

/**
 * Круг Shift+Tab терминального Claude Code (как в ACC) с «только чтением» Codex после «Авто», как
 * в его меню; провайдер берёт из круга свои режимы.
 */
const MODE_CYCLE: readonly PermissionMode[] = [
  'default',
  'acceptEdits',
  'readOnly',
  'plan',
  'bypassPermissions',
  'auto',
]

/**
 * Следующий режим по Shift+Tab: спрашивать → принимать правки → (только чтение) → план → без
 * вопросов → авто → спрашивать. Режим, которого у провайдера нет или который недоступен,
 * пропускается.
 */
export const nextMode = (
  mode: PermissionMode,
  available: ModeAvailability,
  modes: readonly PermissionMode[],
): PermissionMode => {
  const from = MODE_CYCLE.indexOf(mode)
  const after = [...MODE_CYCLE.slice(from + 1), ...MODE_CYCLE.slice(0, from + 1)]

  return (
    after.find((item) => modes.includes(item) && !isModeOff(item, available)) ?? modes[0] ?? mode
  )
}

/**
 * Куда легла бы нажатая цифра или Enter: в поле ввода ответа, в чужое поле или в поле
 * сообщения с черновиком - тогда клавиша их, а не карточки над полем.
 */
export const typedInto = (target: EventTarget | null, composerEmpty: boolean): boolean => {
  if (!(target instanceof HTMLElement)) return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true

  return target.isContentEditable && !composerEmpty
}

/** Клавиша пришла из диалога или всплывающей панели: Esc там закрывает их, а не ход. */
export const fromOverlay = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('dialog, [popover]') !== null
