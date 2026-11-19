import type { RefusedModes, PermissionMode } from '@shared/conversation'

/** Отказов ещё не было: всё, что не запрещено настройками, считается доступным. */
export const NO_REFUSALS: RefusedModes = { bypass: false, autoModels: [] }

/**
 * Отказ CLI перейти в режим - в память панели. bypass запоминается на всю панель (его
 * запрещает политика организации, от модели он не зависит), auto - на модель. Прочие
 * режимы CLI не отказывает, и их отказ ничего не значит. Тот же объект - ничего нового:
 * рассылать окну нечего.
 */
export const withRefusal = (
  refused: RefusedModes,
  mode: PermissionMode,
  model: string,
): RefusedModes => {
  if (mode === 'bypassPermissions') return refused.bypass ? refused : { ...refused, bypass: true }

  if (mode !== 'auto' || refused.autoModels.includes(model)) return refused

  return { ...refused, autoModels: [...refused.autoModels, model] }
}
