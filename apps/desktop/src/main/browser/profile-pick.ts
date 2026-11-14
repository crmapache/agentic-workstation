import { BrowserError } from './browser-error'
import type { HubPort } from './browser-hub'
import type { BrowserProfile } from './browser-hub'
import { profileLabel, isProfileNamed } from './browser-hub'
import type { ProfileOpening } from './chrome-profiles'

const NO_PROFILE =
  'No Chrome profile is connected. Ask the user to install the Agentic Workstation extension (Agentic Workstation → Connectors → Browser Use) and keep Chrome open.'

/** Подключённые профили строкой для отказа: имя, профиль Chrome, ключ. */
export const listProfiles = (profiles: readonly BrowserProfile[]): string =>
  profiles.length
    ? `Connected: ${profiles.map((profile) => `${profileLabel(profile)}, key ${profile.key}`).join('; ')}.`
    : NO_PROFILE

/**
 * Профиль по ключу, имени или профилю Chrome. fromProject - имя взято из настроек проекта, а не
 * у модели: отказ говорит, откуда оно, иначе модель искала бы, где сама его назвала.
 */
const namedProfile = (
  profiles: readonly BrowserProfile[],
  wanted: string,
  fromProject: boolean,
): string => {
  const byKey = profiles.find((profile) => profile.key === wanted)

  if (byKey) return byKey.key

  const [found, ...more] = profiles.filter((profile) => isProfileNamed(profile, wanted))

  if (more.length) {
    throw new BrowserError(
      'bad-request',
      `Several connected Chrome profiles are named "${wanted}"; pass the profile key instead. ${listProfiles(profiles)}`,
    )
  }

  if (!found) {
    throw new BrowserError(
      'profile-offline',
      fromProject
        ? `This project works in the Chrome profile "${wanted}", and it is not connected. ${listProfiles(profiles)} Ask the user to open Chrome in that profile, or pass "profile" if they asked for another one.`
        : `Chrome profile "${wanted}" is not connected. ${listProfiles(profiles)}`,
    )
  }

  return found.key
}

/** Из чего выбирается профиль вызова: названный моделью, группы сессии, проекта. */
export type ProfileWish = {
  wanted: string | undefined
  /** Профиль, где у сессии уже группа вкладок; нет - null. */
  groupKey: string | null
  /** Профиль Chrome проекта (ADR 0053) - спрашивается, только если до него дошло. */
  preferred: () => string | null
}

/**
 * Профиль вызова: названный моделью; не назван - профиль группы сессии, потом профиль проекта,
 * потом единственный. Имя у двух профилей одно («Google Chrome» в двух окнах) - отказ со
 * списком ключей, а не первый попавшийся.
 */
export const pickProfile = (
  profiles: readonly BrowserProfile[],
  { wanted, groupKey, preferred }: ProfileWish,
): string => {
  if (wanted) return namedProfile(profiles, wanted, false)

  if (groupKey && profiles.some((profile) => profile.key === groupKey)) return groupKey

  const projectProfile = preferred()

  if (projectProfile) return namedProfile(profiles, projectProfile, true)

  const [only, ...rest] = profiles

  if (!only) throw new BrowserError('profile-offline', NO_PROFILE)

  if (rest.length) {
    throw new BrowserError(
      'bad-request',
      `Several Chrome profiles are connected; pass "profile". ${listProfiles(profiles)}`,
    )
  }

  return only.key
}

/** Сколько ждать расширение в профиле, чьё окно IDE только что открыла: старт Chrome - секунды. */
export const PROFILE_OPEN_WAIT_MS = 20_000

/** Ждать, пока профиль с этим именем подключится; не дождались или отменили - null. */
const connectedProfile = (
  hub: HubPort,
  name: string,
  signal: AbortSignal | undefined,
): Promise<string | null> =>
  new Promise((resolve) => {
    const cleanups: (() => void)[] = []
    const done = (key: string | null) => {
      for (const cleanup of cleanups) cleanup()
      resolve(key)
    }
    const check = () => {
      const found = hub.profiles().find((profile) => isProfileNamed(profile, name))

      if (found) done(found.key)
    }
    const timer = setTimeout(() => done(null), PROFILE_OPEN_WAIT_MS)
    const abort = () => done(null)

    // Имя профиля Chrome приходит с hello или позже (поиск по файлам) - смотрим на оба.
    cleanups.push(
      hub.onLink((_key, up) => up && check()),
      hub.onProfiles(check),
      () => clearTimeout(timer),
      () => signal?.removeEventListener('abort', abort),
    )
    signal?.addEventListener('abort', abort, { once: true })
    check()
  })

/**
 * Профиль, который назвали (модель или настройки проекта), не на связи: открыть окно браузера в
 * нём и дождаться его расширения (ADR 0053). Нет такого профиля или не открылось - прежний отказ
 * (offline); нет в нём расширения или оно не подключилось - отказ, который говорит, что сделать.
 */
export const reachProfile = async (
  hub: HubPort,
  name: string,
  open: (name: string) => Promise<ProfileOpening>,
  offline: BrowserError,
  signal: AbortSignal | undefined,
): Promise<string> => {
  const opening = await open(name)

  if (opening === 'no-extension') {
    throw new BrowserError(
      'profile-offline',
      `The Chrome profile "${name}" has no Agentic Workstation extension. Ask the user to install it in that profile (Agentic Workstation → Connectors → Browser Use).`,
    )
  }

  if (opening !== 'opened') throw offline

  const key = await connectedProfile(hub, name, signal)

  if (!key) {
    throw new BrowserError(
      'profile-offline',
      `Chrome opened the profile "${name}", but its Agentic Workstation extension did not connect within ${PROFILE_OPEN_WAIT_MS / 1000} seconds. Ask the user to check the extension in that profile.`,
    )
  }

  return key
}
