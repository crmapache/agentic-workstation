import { ChildProcess } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'

type Spawn = (this: ChildProcess, options: SpawnOptions) => void

/**
 * Пометка процесса с окном (браузер), которому окно скрывать нельзя: Windows берёт SW_HIDE из
 * запуска для первого показа окна, и браузер, запущенный впервые, остался бы невидимым. Своё
 * поле в параметрах spawn - Node передаёт параметры дальше целиком.
 */
export const SHOWS_WINDOW = 'agenticWorkstationShowsWindow'

/**
 * Без окна консоли на каждый процесс (Windows, ADR 0048). IDE - программа без консоли, и
 * консольный процесс, который она запускает (git, claude.exe, MCP-сервер, PowerShell),
 * Windows по умолчанию показывает своим чёрным окном - на каждый вызов git окно мигало бы.
 * Флаг windowsHide у Node по умолчанию выключен, а процессы IDE запускают пять десятков мест
 * и чужие библиотеки (MCP SDK). Поэтому флаг ставится один раз - в ChildProcess.prototype.spawn,
 * через который идут spawn, execFile, exec и fork: внутренний метод Node, его нет в типах.
 * Синхронные вызовы (execFileSync) идут мимо - им windowsHide ставят на месте. Программа со
 * своим окном - с пометкой SHOWS_WINDOW.
 */
export const hideConsoleWindows = () => {
  const prototype = ChildProcess.prototype as unknown as { spawn: Spawn }
  const spawn = prototype.spawn

  prototype.spawn = function (this: ChildProcess, options: SpawnOptions) {
    const showsWindow = (options as Record<string, unknown>)[SHOWS_WINDOW] === true

    return spawn.call(this, { ...options, windowsHide: !showsWindow })
  }
}
