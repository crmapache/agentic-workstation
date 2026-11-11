import { createHmac, randomBytes, createCipheriv } from 'node:crypto'

import { macInput, KEY_BYTES } from '@agentic-workstation/remote-protocol/crypto-spec'
import {
  PUSH_KEY_LABEL,
  PUSH_TAG_BYTES,
  PUSH_NONCE_BYTES,
  PUSH_TOPIC_BYTES,
  PUSH_TOPIC_LABEL,
  encodePushPayload,
  pushPayloadHeader,
} from '@agentic-workstation/remote-protocol/push'

import { hkdf } from './crypto'

/**
 * Половина IDE в пушах (push.ts протокола): ключ пуша из долгого ключа пары, тема и печать
 * уведомления для телефона. Открывает его сервис-воркер телефона тем же выводом на WebCrypto;
 * сверку держит тест против настоящего воркерного кода телефона.
 */

/** Ключ пуша: своя метка над долгим ключом пары - ни с одним ключом кадров он не совпадает. */
export const pushKeyOf = (auth: Uint8Array): Buffer =>
  hkdf(new Uint8Array(0), auth, PUSH_KEY_LABEL, KEY_BYTES)

/** Тема пуша - одна на разговор или очередь и непрозрачна для релея и службы пушей. */
export const pushTopic = (pushKey: Uint8Array, tag: string): Buffer =>
  createHmac('sha256', pushKey)
    .update(macInput([PUSH_TOPIC_LABEL, tag]))
    .digest()
    .subarray(0, PUSH_TOPIC_BYTES)

/**
 * Payload пуша: версия и адрес IDE открыто (по ним воркер находит пару), дальше nonce и
 * AES-256-GCM тела под ключом пуша; открытая часть - дополнительные данные печати.
 */
export const sealPush = (
  pushKey: Uint8Array,
  agent: Uint8Array,
  body: Uint8Array,
  nonce: Uint8Array = randomBytes(PUSH_NONCE_BYTES),
): Buffer => {
  const cipher = createCipheriv('aes-256-gcm', pushKey, nonce, { authTagLength: PUSH_TAG_BYTES })

  cipher.setAAD(pushPayloadHeader(agent))

  return Buffer.from(
    encodePushPayload(
      agent,
      nonce,
      Buffer.concat([cipher.update(body), cipher.final(), cipher.getAuthTag()]),
    ),
  )
}
