import { toBase64Url } from '@agentic-workstation/remote-protocol/base64'
import { decodeBody } from '@agentic-workstation/remote-protocol/body'
import { HKDF_INFO, KEY_BYTES } from '@agentic-workstation/remote-protocol/crypto-spec'
import type { PushNotice } from '@agentic-workstation/remote-protocol/push'
import {
  PUSH_KEY_LABEL,
  PUSH_TAG_BYTES,
  parsePushNotice,
  readPushPayload,
} from '@agentic-workstation/remote-protocol/push'

import { agree, hkdfBits } from '../remote/crypto'
import type { MachineRecord } from '../remote/keystore'

/**
 * Половина телефона в пушах (push.ts протокола): открыть payload, который IDE запечатала ключом
 * пары. Живёт в сервис-воркере - ни DOM, ни React, только WebCrypto и IndexedDB. Ключ пуша
 * выводится заново из неизвлекаемого закрытого ключа пары: байты закрытого ключа не видит даже
 * этот код, а сам ключ пуша - неизвлекаемый CryptoKey, годный только на расшифровку.
 */

const subtle = (): SubtleCrypto => globalThis.crypto.subtle

const own = (data: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(data)

/** Ключ пуша пары: HKDF долгого ключа своей меткой (как IDE в wire/push-seal.ts). */
export const pushKeyOf = async (machine: MachineRecord): Promise<CryptoKey> => {
  const auth = await hkdfBits(
    new Uint8Array(0),
    await agree(machine.staticPrivateKey, machine.agentStaticPub),
    HKDF_INFO.auth,
    KEY_BYTES,
  )

  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(PUSH_KEY_LABEL),
    },
    await subtle().importKey('raw', own(auth), 'HKDF', false, ['deriveKey']),
    { name: 'AES-GCM', length: KEY_BYTES * 8 },
    false,
    ['decrypt'],
  )
}

/** Открытый пуш: от какой IDE и что она говорит. */
export type OpenedPush = { agentId: string; notice: PushNotice }

/**
 * Payload пуша по парам телефона; null - не наш, не открылся (пару забыли или отпустили, ключи
 * сменились) или внутри не уведомление. Тогда воркер показывает общее «IDE ждёт тебя»: пуш без
 * уведомления браузер считает нарушением и отбирает разрешение.
 */
export const openPush = async (
  payload: Uint8Array,
  machines: readonly MachineRecord[],
): Promise<OpenedPush | null> => {
  const parts = readPushPayload(payload)

  if (!parts) return null

  const agentId = toBase64Url(parts.agent)
  const machine = machines.find((one) => one.agentId === agentId && !one.revoked)

  if (!machine) return null

  try {
    const plain = await subtle().decrypt(
      {
        name: 'AES-GCM',
        iv: own(parts.nonce),
        additionalData: own(parts.header),
        tagLength: PUSH_TAG_BYTES * 8,
      },
      await pushKeyOf(machine),
      own(parts.sealed),
    )
    const notice = parsePushNotice(decodeBody(new Uint8Array(plain)))

    return notice ? { agentId, notice } : null
  } catch {
    return null
  }
}
