import { stat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Файл хранилища расширения крупнее этого не читается: storage.local расширения - килобайты. */
const STORE_FILE_MAX_BYTES = 8 * 1024 * 1024

/** Так macOS отказывает приложению без «Полного доступа к диску» в чужих данных (Chrome). */
const DENIED_CODES = new Set(['EPERM', 'EACCES'])

/** Что дал поиск: имя профиля (null - не нашли) и закрыла ли система папку браузера. */
export type ChromeLookup = { name: string | null; denied: boolean }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Имена профилей браузера из его Local State (`profile.info_cache`): папка профиля → имя, как
 * его видит человек. У профиля с именем по умолчанию («Your Chrome», «Person 1») Chrome
 * показывает имя аккаунта Google - его и берём.
 */
export const profileNames = (localState: unknown): Map<string, string> => {
  const profile = isRecord(localState) ? localState['profile'] : null
  const cache = isRecord(profile) ? profile['info_cache'] : null
  const names = new Map<string, string>()

  if (!isRecord(cache)) return names

  for (const [dir, entry] of Object.entries(cache)) {
    if (!isRecord(entry)) continue

    const own = text(entry, 'name')
    const account = text(entry, 'gaia_given_name') || text(entry, 'gaia_name')
    const name = entry['is_using_default_name'] === true && account ? account : own || account

    if (name) names.set(dir, name)
  }

  return names
}

/** Есть ли ключ в файлах хранилища расширения этого профиля (LevelDB: журнал .log и таблицы .ldb). */
const holdsKey = async (storeDir: string, key: string): Promise<boolean> => {
  const files = await readdir(storeDir).catch(() => [])

  for (const file of files) {
    if (!file.endsWith('.log') && !file.endsWith('.ldb')) continue

    const path = join(storeDir, file)
    const info = await stat(path).catch(() => null)

    if (!info?.isFile() || info.size > STORE_FILE_MAX_BYTES) continue

    const bytes = await readFile(path).catch(() => null)

    if (bytes?.includes(key)) return true
  }

  return false
}

/**
 * Профиль браузера, в котором стоит копия расширения с этим ключом (ADR 0052). Ни одно API
 * расширения имени профиля не отдаёт, а ключ копия хранит в своём storage.local - это файлы
 * LevelDB внутри папки профиля. Ключ - 8 случайных знаков: в чужом профиле его не будет, а
 * сжатие таблиц (snappy) короткую строку без повторов оставляет как есть. Ищем по всем
 * браузерам семейства Chromium (dataDirs - их папки с Local State). На macOS папки браузеров
 * читаются только с «Полным доступом к диску»: без него - denied, окно скажет, что дать.
 */
export const findChromeProfile = async (
  dataDirs: readonly string[],
  extensionId: string,
  key: string,
): Promise<ChromeLookup> => {
  let denied = false

  for (const dataDir of dataDirs) {
    const localState = await readFile(join(dataDir, 'Local State'), 'utf8')
      .then((raw): unknown => JSON.parse(raw))
      .catch((error: unknown) => {
        const code = (error as NodeJS.ErrnoException | null)?.code ?? ''

        // macOS не пускает в данные Chrome приложение без «Полного доступа к диску» (ADR 0052).
        denied ||= DENIED_CODES.has(code)

        return null
      })

    for (const [dir, name] of profileNames(localState)) {
      const storeDir = join(dataDir, dir, 'Local Extension Settings', extensionId)

      if (await holdsKey(storeDir, key)) return { name, denied: false }
    }
  }

  return { name: null, denied }
}

/** Профиль браузера человека для выбора в проекте: имя и стоит ли в нём расширение IDE. */
export type ChromeProfileEntry = { name: string; hasExtension: boolean }

/** Стоит ли расширение в профиле: его запись в настройках расширений профиля. */
const installedIn = async (profileDir: string, extensionId: string): Promise<boolean> => {
  for (const file of ['Secure Preferences', 'Preferences']) {
    const prefs = await readFile(join(profileDir, file), 'utf8')
      .then((raw): unknown => JSON.parse(raw))
      .catch(() => null)
    const extensions = isRecord(prefs) ? prefs['extensions'] : null
    const settings = isRecord(extensions) ? extensions['settings'] : null

    if (isRecord(settings) && isRecord(settings[extensionId])) return true
  }

  return false
}

/**
 * Все профили браузеров человека - не только те, что сейчас на связи: проекту выбирают профиль,
 * даже когда его окно закрыто, и видно, где расширения ещё нет. Без «Полного доступа к диску» -
 * пусто (окно тогда показывает подключённые).
 */
export const listChromeProfiles = async (
  dataDirs: readonly string[],
  extensionId: string,
): Promise<ChromeProfileEntry[]> => {
  const entries: ChromeProfileEntry[] = []

  for (const dataDir of dataDirs) {
    const localState = await readFile(join(dataDir, 'Local State'), 'utf8')
      .then((raw): unknown => JSON.parse(raw))
      .catch(() => null)

    for (const [dir, name] of profileNames(localState)) {
      entries.push({ name, hasExtension: await installedIn(join(dataDir, dir), extensionId) })
    }
  }

  return entries
}

/**
 * Чем кончилась попытка открыть закрытый профиль: окно открыто, в профиле нет расширения,
 * такого профиля нет, не открылось.
 */
export type ProfileOpening = 'opened' | 'no-extension' | 'unknown' | 'failed'

/** Где профиль браузера человека: папка данных браузера, папка профиля и стоит ли расширение. */
export type ChromeProfilePlace = { dataDir: string; dir: string; hasExtension: boolean }

/**
 * Профиль браузера по имени, как его видит человек (без учёта регистра), - чтобы открыть его
 * окно, когда профиль закрыт (ADR 0053). Нет такого - null.
 */
export const findProfilePlace = async (
  dataDirs: readonly string[],
  extensionId: string,
  name: string,
): Promise<ChromeProfilePlace | null> => {
  const wanted = name.trim().toLowerCase()

  for (const dataDir of dataDirs) {
    const localState = await readFile(join(dataDir, 'Local State'), 'utf8')
      .then((raw): unknown => JSON.parse(raw))
      .catch(() => null)

    for (const [dir, own] of profileNames(localState)) {
      if (own.toLowerCase() !== wanted) continue

      return { dataDir, dir, hasExtension: await installedIn(join(dataDir, dir), extensionId) }
    }
  }

  return null
}
