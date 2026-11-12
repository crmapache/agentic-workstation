import { toBase64Url } from '@agentic-workstation/remote-protocol/base64'
import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import { HKDF_INFO, KEY_BYTES } from '@agentic-workstation/remote-protocol/crypto-spec'
import type { PushNotice } from '@agentic-workstation/remote-protocol/push'
import {
  PUSH_KEY_LABEL,
  encodePushPayload,
  pushPayloadHeader,
} from '@agentic-workstation/remote-protocol/push'

import { agree, hkdfBits, exportPublic, generateKeyPair } from '../../remote/crypto'
import type { MachineRecord } from '../../remote/keystore'

/**
 * Пара телефона с IDE для тестов пушей и печать уведомления за IDE - на WebCrypto, по
 * раскладке протокола, а не кодом IDE: сверку с настоящей IDE держит e2e/push-interop.test.ts.
 */

export const NOTICE: PushNotice = {
  p: 1,
  reason: 'permission',
  detail: '',
  provider: 'claude',
  project: 'demo',
  title: 'Fix the login bug',
  tool: 'Bash',
  until: 0,
  tag: 'c-6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
  route: {
    screen: 'conversation',
    projectKey: `p-${'k'.repeat(22)}`,
    conversationId: '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
  },
  at: 1000,
}

/** Пара: запись телефона (как в IndexedDB) и печать пуша ключами IDE. */
export const pairedMachine = async () => {
  const phone = await generateKeyPair()
  const agent = await generateKeyPair()
  const address = crypto.getRandomValues(new Uint8Array(16))
  const machine: MachineRecord = {
    agentId: toBase64Url(address),
    relayUrl: 'wss://relay.example',
    label: 'Agentic Workstation on test',
    agentStaticPub: await exportPublic(agent.publicKey),
    fingerprint: '0011223344556677',
    staticPrivateKey: phone.privateKey,
    staticPub: await exportPublic(phone.publicKey),
    pairedAt: 1,
    revoked: false,
  }
  /** Уведомление, запечатанное так, как это делает IDE (wire/push-seal.ts). */
  const seal = async (notice: object = NOTICE): Promise<Uint8Array> => {
    const auth = await hkdfBits(
      new Uint8Array(0),
      await agree(agent.privateKey, machine.staticPub),
      HKDF_INFO.auth,
      KEY_BYTES,
    )
    const raw = await hkdfBits(new Uint8Array(0), auth, PUSH_KEY_LABEL, KEY_BYTES)
    const key = await crypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, [
      'encrypt',
    ])
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    const sealed = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: new Uint8Array(pushPayloadHeader(address)) },
      key,
      new Uint8Array(encodeBody(notice)),
    )

    return encodePushPayload(address, nonce, new Uint8Array(sealed))
  }

  return { machine, seal }
}
