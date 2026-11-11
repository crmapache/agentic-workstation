import { fromBase64Url } from '@agentic-workstation/remote-protocol/base64'
import type { PushSubscriptionWire } from '@agentic-workstation/remote-protocol/push'
import { isPushSubscription } from '@agentic-workstation/remote-protocol/push'

/**
 * Уведомления на телефоне без React: разрешение, подписка у службы пушей браузера ключом VAPID
 * релея и передача подписки IDE (sink - RemoteClient). Браузер - за узким окружением
 * (push-browser.ts), тест подставляет подделку PushManager.
 *
 * - checking - ещё не знаем; unsupported - браузер не умеет; install - iPhone не с экрана
 *   «Домой» (пуши там только у установленного приложения); unavailable - релей пуши не шлёт;
 *   denied - человек запретил в настройках; off, on; working - кнопку нажали, ждём браузер.
 */
export type PushStatus =
  'checking' | 'unsupported' | 'install' | 'unavailable' | 'denied' | 'off' | 'on' | 'working'

export type PushSubscriptionLike = {
  toJSON: () => { endpoint?: string | undefined; keys?: Record<string, string> | undefined }
  options?: { applicationServerKey: ArrayBuffer | null } | undefined
  unsubscribe: () => Promise<boolean>
}

export type PushManagerLike = {
  getSubscription: () => Promise<PushSubscriptionLike | null>
  subscribe: (options: {
    userVisibleOnly: true
    applicationServerKey: Uint8Array<ArrayBuffer>
  }) => Promise<PushSubscriptionLike>
}

export type PushEnvironment = {
  /** Браузер умеет пуши: сервис-воркер, PushManager, Notification. */
  supported: boolean
  /** iPhone или iPad не с экрана «Домой»: пуши появятся, когда приложение установят. */
  needsInstall: boolean
  permission: () => NotificationPermission
  requestPermission: () => Promise<NotificationPermission>
  pushManager: () => Promise<PushManagerLike | null>
  /** Открытый ключ VAPID релея (/v1/info); null - релей пуши не шлёт. */
  relayKey: () => Promise<string | null>
  /** Человек выключил уведомления здесь: при запуске подписка не возвращается сама. */
  optedOut: { read: () => boolean; write: (value: boolean) => void }
}

/** Куда идёт подписка: каждой IDE (RemoteClient); null - уведомления выключены. */
export type PushSink = (subscription: PushSubscriptionWire | null) => void

/** Подписка браузера словами протокола; ключи не той длины - null. */
export const subscriptionWire = (
  subscription: PushSubscriptionLike,
): PushSubscriptionWire | null => {
  const json = subscription.toJSON()
  const wire = {
    endpoint: json.endpoint ?? '',
    p256dh: json.keys?.['p256dh'] ?? '',
    auth: json.keys?.['auth'] ?? '',
  }

  return isPushSubscription(wire) ? wire : null
}

/** Подписка сделана этим ключом релея: другой ключ - служба её от релея не примет. */
const madeWith = (subscription: PushSubscriptionLike, key: Uint8Array): boolean => {
  const used = subscription.options?.applicationServerKey

  if (!used) return true

  const bytes = new Uint8Array(used)

  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index])
}

export class PushSetup {
  status: PushStatus = 'checking'
  private key: Uint8Array<ArrayBuffer> | null = null

  constructor(
    private readonly env: PushEnvironment,
    private readonly sink: PushSink,
    private readonly onStatus: (status: PushStatus) => void,
  ) {}

  /**
   * При запуске и когда страница снова на виду: что с уведомлениями сейчас. Разрешение есть, а
   * подписки нет (браузер её снял) или она сделана другим ключом релея - подписаться заново
   * молча: спрашивать человека второй раз не о чем.
   */
  async start(): Promise<void> {
    // Кнопку уже нажали: её шаги ведут сами, проверка поверх них только спутала бы состояние.
    if (this.status === 'working') return
    if (!this.env.supported) return this.set(this.env.needsInstall ? 'install' : 'unsupported')
    if (!(await this.loadKey())) return this.set('unavailable')

    const permission = this.env.permission()

    if (permission === 'denied') {
      this.sink(null)

      return this.set('denied')
    }

    const manager = await this.env.pushManager()

    if (!manager) return this.set('unsupported')

    const existing = await manager.getSubscription()

    if (permission !== 'granted' || this.env.optedOut.read()) {
      await existing?.unsubscribe().catch(() => false)
      this.sink(null)

      return this.set('off')
    }

    this.set((await this.subscribe(manager, existing)) ? 'on' : 'off')
  }

  /**
   * Кнопка «Turn on»: разрешение - первым же шагом, пока жест человека жив (Safari без жеста
   * его не спрашивает). false - не вышло (запретили, служба не ответила).
   */
  async enable(): Promise<boolean> {
    if (!this.env.supported || !this.key) return false

    this.set('working')

    const permission =
      this.env.permission() === 'granted' ? 'granted' : await this.env.requestPermission()

    if (permission !== 'granted') {
      this.set(permission === 'denied' ? 'denied' : 'off')

      return false
    }

    const manager = await this.env.pushManager()
    const subscribed = manager
      ? await this.subscribe(manager, await manager.getSubscription())
      : false

    if (subscribed) this.env.optedOut.write(false)

    this.set(subscribed ? 'on' : 'off')

    return subscribed
  }

  /** Выключить: подписка снимается у браузера, IDE слышат pushClear и больше не будят. */
  async disable(): Promise<void> {
    this.set('working')
    this.env.optedOut.write(true)

    const manager = await this.env.pushManager()

    await (await manager?.getSubscription())?.unsubscribe().catch(() => false)
    this.sink(null)
    this.set('off')
  }

  private async loadKey(): Promise<boolean> {
    if (this.key) return true

    const text = await this.env.relayKey().catch(() => null)
    const bytes = text ? fromBase64Url(text) : null

    this.key = bytes?.length === 65 ? new Uint8Array(bytes) : null

    return this.key !== null
  }

  /** Своя подписка этим ключом - IDE; чужим ключом - заменить; не вышло - IDE «выключено». */
  private async subscribe(
    manager: PushManagerLike,
    existing: PushSubscriptionLike | null,
  ): Promise<boolean> {
    const key = this.key

    if (!key) return false

    try {
      let subscription = existing

      if (subscription && !madeWith(subscription, key)) {
        await subscription.unsubscribe()
        subscription = null
      }

      subscription ??= await manager.subscribe({ userVisibleOnly: true, applicationServerKey: key })

      const wire = subscriptionWire(subscription)

      this.sink(wire)

      return wire !== null
    } catch {
      this.sink(null)

      return false
    }
  }

  private set(status: PushStatus) {
    this.status = status
    this.onStatus(status)
  }
}
