import type { PushEnvironment, PushManagerLike } from './push-setup'

/**
 * Уведомления глазами браузера телефона: что он умеет, разрешение, PushManager сервис-воркера,
 * ключ VAPID релея и выбор человека. Всё, чего нет в тесте, - здесь.
 */

const OPTED_OUT_KEY = 'aw-push-off'

/** Сколько ждать сервис-воркер: не зарегистрировался - пушей на этой странице нет. */
const WORKER_PATIENCE_MS = 10_000

/** iPhone и iPad (iPadOS называет себя Mac, но у него есть касание). */
const isAppleMobile = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

/** Открыто с экрана «Домой», а не во вкладке Safari. */
const isInstalled = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const readOptedOut = (): boolean => {
  try {
    return window.localStorage.getItem(OPTED_OUT_KEY) === '1'
  } catch {
    return false
  }
}

const writeOptedOut = (value: boolean): void => {
  try {
    if (value) window.localStorage.setItem(OPTED_OUT_KEY, '1')
    else window.localStorage.removeItem(OPTED_OUT_KEY)
  } catch {
    // Хранилища нет (приватный режим): выбор живёт до закрытия страницы, как и пары.
  }
}

const pushManager = async (): Promise<PushManagerLike | null> => {
  const ready = navigator.serviceWorker.ready.then((registration) => registration.pushManager)
  const late = new Promise<null>((resolve) => setTimeout(() => resolve(null), WORKER_PATIENCE_MS))

  return Promise.race([ready, late])
}

/** Ключ VAPID релея этой страницы - его /v1/info; пуши выключены - null. */
const relayKey = async (): Promise<string | null> => {
  const response = await fetch('/v1/info', { cache: 'no-store' })
  const info = (await response.json()) as { push?: unknown; pushPublicKey?: unknown }

  return info.push === true && typeof info.pushPublicKey === 'string' ? info.pushPublicKey : null
}

/**
 * Окружение браузера. Воркер есть только у сборки (main.tsx): в dev уведомлений нет, и экран
 * говорит, что браузер их не показывает.
 */
export const browserPushEnvironment = (): PushEnvironment => {
  const supported =
    import.meta.env.PROD &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  return {
    supported,
    needsInstall: !supported && isAppleMobile() && !isInstalled(),
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    pushManager,
    relayKey,
    optedOut: { read: readOptedOut, write: writeOptedOut },
  }
}
