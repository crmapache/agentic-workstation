import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { dirname } from 'node:path'
import { promisify } from 'node:util'

import type { ManualUpdateReason } from '@shared/updates'

const run = promisify(execFile)

/** Путь к бандлу по пути исполняемого файла: …/Agentic Workstation.app/Contents/MacOS/Agentic Workstation. */
export const findAppBundle = (executablePath: string): string | null =>
  /^(.+?\.app)\/Contents\/MacOS\/[^/]+$/.exec(executablePath)?.[1] ?? null

/**
 * Приложение запущено не из папки, а из смонтированного dmg или из карантинной
 * копии, которую macOS делает для непроверенных приложений. Подменять там нечего:
 * копия исчезнет вместе с образом или при следующем запуске.
 */
export const isTransientLocation = (bundlePath: string) =>
  bundlePath.startsWith('/Volumes/') || bundlePath.includes('/AppTranslocation/')

/** Правило подписи из вывода `codesign -d -r-`: строка «designated => …». */
export const parseDesignatedRequirement = (output: string): string | null =>
  /^designated => (.+)$/m.exec(output)?.[1]?.trim() ?? null

/**
 * Подпись ad-hoc: правило узнаёт приложение по хешу этой самой сборки, и никакая
 * новая версия под него не подойдёт.
 */
export const isAdHocRequirement = (requirement: string) => /(^|\s)cdhash\s/.test(requirement)

/**
 * Правило, по которому macOS узнаёт это приложение. Новая версия ставится, только
 * если подписана так, что подходит под него, - то есть тем же сертификатом.
 */
export const readDesignatedRequirement = async (bundlePath: string): Promise<string | null> => {
  // codesign печатает «Executable=…» в stderr, а правило - в stdout. Берём оба.
  const { stdout, stderr } = await run('codesign', ['-d', '-r-', bundlePath])

  return parseDesignatedRequirement(`${stdout}\n${stderr}`)
}

/**
 * Почему обновиться можно только руками, или null, если приложение может
 * поставить новую версию само.
 */
export const getManualUpdateReason = async (
  isPackaged: boolean,
  executablePath: string,
): Promise<ManualUpdateReason | null> => {
  if (!isPackaged) return 'development'

  const bundlePath = findAppBundle(executablePath)

  if (bundlePath === null || isTransientLocation(bundlePath)) return 'not-installed'

  try {
    await access(dirname(bundlePath), constants.W_OK)
  } catch {
    return 'read-only-location'
  }

  const requirement = await readDesignatedRequirement(bundlePath).catch(() => null)

  if (requirement === null || isAdHocRequirement(requirement)) return 'unsigned-build'

  return null
}
