import type { ProfileInfo } from '../common/messages'

const KEY = 'profileKey'
const NAME = 'profileName'
const CHROME_PROFILE = 'chromeProfile'
const LAUNCH = 'launchMarker'

/** Ключ профиля: 8 знаков a-z0-9 - коротко для ссылки и не повторится среди профилей человека. */
const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Метка запуска Chrome: 6 знаков - ссылка остаётся короткой, а совпасть ей почти не с чем. */
const LAUNCH_LENGTH = 6

const newKey = (length = 8): string =>
  [...crypto.getRandomValues(new Uint8Array(length))]
    .map((byte) => KEY_ALPHABET[byte % KEY_ALPHABET.length])
    .join('')

/**
 * Имя браузера из брендов User-Agent: Google Chrome, Brave, Microsoft Edge. Арк и Chromium
 * называют себя Chromium.
 */
export const browserName = (brands: readonly { brand: string }[] | undefined): string =>
  brands?.map(({ brand }) => brand).find((brand) => !/chromium|not.?a.?brand/i.test(brand)) ??
  'Chromium'

type UserAgentData = { brands?: { brand: string }[] }

const currentBrowser = (): string =>
  browserName((navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData?.brands)

/**
 * Ключ создаётся одним обещанием на сервис-воркер: обе связи (установленная IDE и dev) просят
 * профиль разом на первом запуске, и без этого каждая записала бы свой ключ.
 */
let keyLoading: Promise<string> | null = null

const profileKey = (): Promise<string> => {
  keyLoading ??= (async () => {
    const stored = await chrome.storage.local.get(KEY)
    const storedKey: unknown = stored[KEY]

    if (typeof storedKey === 'string' && /^[a-z0-9]{8}$/.test(storedKey)) return storedKey

    const key = newKey()

    await chrome.storage.local.set({ [KEY]: key })

    return key
  })()

  return keyLoading
}

let launchLoading: Promise<string> | null = null

/**
 * Метка запуска Chrome. Живёт в storage.local и меняется только на старте браузера
 * (newLaunchMarker из runtime.onStartup): перезапуск сервис-воркера или перезагрузка
 * расширения id вкладок не меняют, и прежние ссылки остаются верными.
 */
const launchMarker = (): Promise<string> => {
  launchLoading ??= (async () => {
    const stored = await chrome.storage.local.get(LAUNCH)
    const marker: unknown = stored[LAUNCH]

    if (typeof marker === 'string' && /^[a-z0-9]{6}$/.test(marker)) return marker

    const fresh = newKey(LAUNCH_LENGTH)

    await chrome.storage.local.set({ [LAUNCH]: fresh })

    return fresh
  })()

  return launchLoading
}

/**
 * Chrome стартовал: новая метка. Обещание ставится сразу, до записи: hello, который пойдёт
 * следом, уже дождётся новой метки, а не прочтёт прежнюю.
 */
export const newLaunchMarker = (): Promise<string> => {
  const fresh = newKey(LAUNCH_LENGTH)

  launchLoading = chrome.storage.local.set({ [LAUNCH]: fresh }).then(() => fresh)

  return launchLoading
}

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Профиль этой установки расширения. Ключ создаётся один раз и живёт в storage.local
 * профиля Chrome - по нему ИИ отличает вкладки рабочего профиля от личного. Имя меняет
 * человек в окне значка; пока не менял - имя профиля Chrome (его называет IDE), без него -
 * имя браузера.
 */
export const loadProfile = async (): Promise<ProfileInfo> => {
  const [key, launch, stored] = await Promise.all([
    profileKey(),
    launchMarker(),
    chrome.storage.local.get([NAME, CHROME_PROFILE]),
  ])
  const own = textOf(stored[NAME])
  const browser = currentBrowser()

  return {
    key,
    name: own || textOf(stored[CHROME_PROFILE]) || browser,
    named: own !== '',
    browser,
    launch,
  }
}

/**
 * Имя профиля Chrome, которое назвала IDE (ADR 0052): API расширения его не знает. Не нашла -
 * прежнее остаётся. true - имя поменялось, окну значка перечитать.
 */
export const rememberChromeProfile = async (name: string | null | undefined): Promise<boolean> => {
  const clean = textOf(name).slice(0, 60)

  if (!clean) return false

  const stored = await chrome.storage.local.get(CHROME_PROFILE)

  if (stored[CHROME_PROFILE] === clean) return false

  await chrome.storage.local.set({ [CHROME_PROFILE]: clean })

  return true
}

/** Новое имя профиля; пустое - снова имя по умолчанию (профиль Chrome или браузер). */
export const renameProfile = async (name: string): Promise<ProfileInfo> => {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 60)

  if (clean) await chrome.storage.local.set({ [NAME]: clean })
  else await chrome.storage.local.remove(NAME)

  return loadProfile()
}
