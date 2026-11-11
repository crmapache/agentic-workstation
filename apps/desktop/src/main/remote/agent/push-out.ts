import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import { FRAME_PUSH } from '@agentic-workstation/remote-protocol/frame'
import type { PushNotice } from '@agentic-workstation/remote-protocol/push'
import {
  p256dhBytes,
  pushAuthBytes,
  encodePushBody,
  MAX_PUSH_PAYLOAD_BYTES,
} from '@agentic-workstation/remote-protocol/push'

import type { RemoteStore } from '../store/remote-store'
import { buildFrame, decodeAddress } from '../wire/frame'
import { sealPush, pushKeyOf, pushTopic } from '../wire/push-seal'

export type PushOutHost = {
  store: RemoteStore
  /** Адрес IDE на релее. */
  address: () => Buffer
  /** Кадр релею - срочной очередью телефона: уйдёт со следующим сливом. */
  offer: (deviceId: string, frame: Buffer) => void
}

/**
 * Пуш телефону: уведомление запечатано ключом пары, подписка браузера - открыто для релея
 * (ему надо знать, куда звонить). Кадр FRAME_PUSH дальше релея не идёт: телефону кадр не
 * пересылается, его будит служба пушей.
 */
export class PushOut {
  constructor(private readonly host: PushOutHost) {}

  /** false - будить нечем: подписки или ключа пары нет, уведомление не влезло. */
  send(deviceId: string, notice: PushNotice): boolean {
    const { store } = this.host
    const subscription = store.pushOf(deviceId)
    const auth = store.deviceSecret(deviceId)
    const p256dh = subscription ? p256dhBytes(subscription.p256dh) : null
    const browserAuth = subscription ? pushAuthBytes(subscription.auth) : null

    if (!subscription || !auth || !p256dh || !browserAuth) return false

    const address = this.host.address()
    const key = pushKeyOf(auth)
    const payload = sealPush(key, address, encodeBody(notice))

    if (payload.length > MAX_PUSH_PAYLOAD_BYTES) {
      console.warn(`[remote] уведомление в ${payload.length} байт не влезает в пуш - не послано`)

      return false
    }

    const body = encodePushBody({
      topic: pushTopic(key, notice.tag),
      p256dh,
      auth: browserAuth,
      endpoint: subscription.endpoint,
      payload,
    })

    this.host.offer(deviceId, buildFrame(FRAME_PUSH, decodeAddress(deviceId), address, 0n, body))

    return true
  }
}
