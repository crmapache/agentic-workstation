import { realpath } from 'node:fs/promises'
import { sep, relative, isAbsolute } from 'node:path'

/**
 * Настоящий путь файла, если он внутри папки, иначе null (файла нет - тоже null). Сравниваются
 * настоящие пути, после всех символических ссылок: ссылка в проекте на ~/.ssh ведёт наружу, и
 * по строке пути её не поймать. Для браузера ИИ (ADR 0040): страница может уговорить модель
 * отправить файл с диска, поэтому загрузка и адреса file: - только из папки разговора.
 */
export const realPathInside = async (root: string, path: string): Promise<string | null> => {
  const [realRoot, realTarget] = await Promise.all([
    realpath(root).catch(() => null),
    realpath(path).catch(() => null),
  ])

  if (!realRoot || !realTarget) return null

  const fromRoot = relative(realRoot, realTarget)

  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return null

  return realTarget
}
