import { WebPushError, sendNotification } from 'web-push'

import type { PushOrder } from './push-frame.ts'
import type { PushKeys } from './push-keys.ts'

/**
 * Единственное место релея, которое звонит чужому серверу - службе пушей Apple, Google,
 * Mozilla или Microsoft. Шифрование RFC 8291 и подпись VAPID - библиотекой web-push, а не
 * своими руками: ошибка в них даёт уведомления, которые приходят как «сайт обновился в фоне», и
 * это та поломка, которую не видно в тесте и видит каждый в жизни.
 *
 * Отправитель - отдельной функцией, чтобы тесты подставляли свой и никогда не звонили настоящим
 * службам.
 */

/** Что ответила служба: код HTTP; 0 - не дозвонились (сеть, тайм-аут, кривой ключ браузера). */
export type PushSender = (order: PushOrder, options: { ttlSeconds: number }) => Promise<number>

/** Сколько ждать службу пушей: дольше - сокет закрывается, пуш считается не ушедшим. */
const TIMEOUT_MS = 10_000

export const webPushSender =
  (keys: PushKeys): PushSender =>
  async (order, options) => {
    try {
      const sent = await sendNotification(
        { endpoint: order.endpoint, keys: { p256dh: order.p256dh, auth: order.auth } },
        order.payload,
        {
          vapidDetails: keys,
          TTL: options.ttlSeconds,
          // Всё, что будит телефон, - «ждёт тебя»: служба доставляет сразу, а не к удобному
          // для батареи моменту.
          urgency: 'high',
          contentEncoding: 'aes128gcm',
          timeout: TIMEOUT_MS,
          ...(order.topic ? { topic: order.topic } : {}),
        },
      )

      return sent.statusCode
    } catch (error) {
      return error instanceof WebPushError ? error.statusCode : 0
    }
  }
