import type { PermissionMode } from '@shared/conversation'

/** Правило прав OpenCode: действие (имя инструмента), ресурс (путь, команда) и решение. */
export type PermissionRule = { action: string; resource: string; effect: 'allow' | 'deny' | 'ask' }

/**
 * Без вопросов в любом режиме: чтение и поиск ничего не меняют, вопрос человеку (`question`)
 * и есть вопрос - разрешение на него было бы вторым вопросом подряд, а субагент (`subagent`)
 * работает под теми же правилами режима, что и разговор (замерено на 2.3.2).
 */
const QUIET_ACTIONS = [
  'read',
  'glob',
  'grep',
  'list',
  'todowrite',
  'todoread',
  'skill',
  'question',
  'subagent',
]

/** Правки файлов: у OpenCode это `edit` и `write`. */
const EDIT_ACTIONS = ['edit', 'write']

const rule = (action: string, effect: PermissionRule['effect']): PermissionRule => ({
  action,
  resource: '*',
  effect,
})

/**
 * Режим панели - правилами сессии OpenCode (проверено вживую: побеждает последнее совпавшее
 * правило). «Спрашивать» - всё, кроме чтения, спрашивает; «Авто» - правки без вопросов,
 * команды и сеть спрашивают; «Только чтение» и план - правки запрещены; «Без вопросов» - всё
 * разрешено. Сверху - то, что человек разрешил «для этого разговора».
 */
export const rulesFor = (
  mode: PermissionMode,
  allowedHere: readonly string[] = [],
): PermissionRule[] => {
  if (mode === 'bypassPermissions') return [rule('*', 'allow')]

  const edits =
    mode === 'acceptEdits' || mode === 'auto'
      ? EDIT_ACTIONS.map((action) => rule(action, 'allow'))
      : mode === 'readOnly' || mode === 'plan'
        ? EDIT_ACTIONS.map((action) => rule(action, 'deny'))
        : []
  const here =
    mode === 'readOnly' || mode === 'plan'
      ? allowedHere.filter((action) => !EDIT_ACTIONS.includes(action))
      : allowedHere

  return [
    rule('*', 'ask'),
    ...QUIET_ACTIONS.map((action) => rule(action, 'allow')),
    ...edits,
    ...here.map((action) => rule(action, 'allow')),
  ]
}

/** Агент OpenCode режима: план - свой агент `plan`, остальное - `build`. */
export const agentFor = (mode: PermissionMode): 'plan' | 'build' =>
  mode === 'plan' ? 'plan' : 'build'
