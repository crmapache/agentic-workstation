import type { PermissionMode, ModeAvailability } from '@shared/claude'

/**
 * Следующий режим по Shift+Tab - круг терминального Claude Code (как в ACC): спрашивать →
 * принимать правки → план → без вопросов → авто → спрашивать; недоступный пропускается.
 */
export const nextMode = (mode: PermissionMode, available: ModeAvailability): PermissionMode => {
  switch (mode) {
    case 'default':
      return 'acceptEdits'
    case 'acceptEdits':
      return 'plan'
    case 'plan':
      return available.bypass ? 'bypassPermissions' : available.auto ? 'auto' : 'default'
    case 'bypassPermissions':
      return available.auto ? 'auto' : 'default'
    default:
      return 'default'
  }
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
