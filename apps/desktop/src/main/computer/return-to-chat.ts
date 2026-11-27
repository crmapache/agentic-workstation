import type { ProviderId } from '@shared/providers'

/** Вкладка панели, где шла работа: провайдер и папка проекта. */
export type ChatPlace = { provider: ProviderId; projectPath: string }

/** Чем IDE возвращает человека к чату: панели, проекты и окно - её, Computer о них не знает. */
export type ChatReturnPorts = {
  /** Человек не выключил возврат в Settings → Chat. */
  isWanted: () => boolean
  /** Чья вкладка разговор с этим ключом; не вкладка панели (сценарий, задание) - null. */
  find: (key: string) => ChatPlace | null
  openProject: (projectPath: string) => Promise<unknown>
  /** Выбрать вкладку разговора в его проекте. */
  activate: (provider: ProviderId, key: string) => void
  /** Окну: открыть панель провайдера - раскладка зон живёт в окне. */
  showPanel: (provider: ProviderId) => void
  /** Вывести окно IDE вперёд. */
  raise: () => void
}

/**
 * Вернуть человека к чату, где шла работа на компьютере (ADR 0130): проект разговора, его
 * вкладка, панель провайдера - и только потом окно вперёд, чтобы человек не увидел на миг чужой
 * проект. У сценария и задания вкладки панели нет - их прогон окно не выдёргивает: они работают
 * в фоне, без человека у экрана. Выключил возврат человек - окно остаётся, где было. Ответ -
 * вернула ли.
 */
export const returnToChat = async (key: string, ports: ChatReturnPorts): Promise<boolean> => {
  const place = ports.isWanted() ? ports.find(key) : null

  if (!place) return false

  await ports.openProject(place.projectPath)
  ports.activate(place.provider, key)
  ports.showPanel(place.provider)
  ports.raise()

  return true
}
