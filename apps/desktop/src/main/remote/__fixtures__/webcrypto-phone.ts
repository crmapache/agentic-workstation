import { webcrypto } from 'node:crypto'

import type { HandshakeReply } from '@agentic-workstation/remote-protocol/agent-messages'
import {
  parseAgentMessage,
  parseHandshakeReply,
} from '@agentic-workstation/remote-protocol/agent-messages'
import {
  toBase64,
  fromBase64,
  toBase64Url,
  fromBase64Url,
} from '@agentic-workstation/remote-protocol/base64'
import { decodeBody, encodeBody } from '@agentic-workstation/remote-protocol/body'
import {
  nonceOf,
  macInput,
  HKDF_INFO,
  fingerprintOf,
  PAIR_ACK_LABEL,
  sessionSaltText,
  PAIR_PROOF_LABEL,
} from '@agentic-workstation/remote-protocol/crypto-spec'
import {
  decodeFrame,
  encodeFrame,
  encodeHeader,
  FRAME_SEALED,
} from '@agentic-workstation/remote-protocol/frame'
import { parsePairingFragment } from '@agentic-workstation/remote-protocol/pairing-url'

/**
 * Телефон Remote Control, написанный на WebCrypto - тем же API, каким считает браузер
 * телефона, и независимо от `node:crypto` IDE. Общие у них только метки и формат
 * (packages/remote-protocol). С ним тесты проходят дорогу телефона до настоящего агента IDE и
 * обратно - напрямую через подделку сокета или через настоящий релей. Образец для apps/phone.
 */

type Key = webcrypto.CryptoKey

type Pair = { publicKey: Key; privateKey: Key }

const { subtle } = webcrypto

const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const

export type Message = Record<string, unknown> & { k: string }

type PhoneKeys = {
  toAgent: Uint8Array
  fromAgent: Uint8Array
  prefixToAgent: Uint8Array
  prefixFromAgent: Uint8Array
}

const keyPair = (): Promise<Pair> => subtle.generateKey(ECDH, true, ['deriveBits'])

const spki = async (key: Key) => toBase64(new Uint8Array(await subtle.exportKey('spki', key)))

const agree = async (privateKey: Key, pub: string) =>
  new Uint8Array(
    await subtle.deriveBits(
      {
        name: 'ECDH',
        public: await subtle.importKey(
          'spki',
          fromBase64(pub) ?? new Uint8Array(0),
          ECDH,
          true,
          [],
        ),
      },
      privateKey,
      256,
    ),
  )

export const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: string, bytes: number) =>
  new Uint8Array(
    await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) },
      await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']),
      bytes * 8,
    ),
  )

export const mac = async (secret: Uint8Array, parts: string[]) =>
  new Uint8Array(
    await subtle.sign(
      'HMAC',
      await subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
      macInput(parts),
    ),
  )

const sha256 = async (data: Uint8Array) => new Uint8Array(await subtle.digest('SHA-256', data))

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0

  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }

  return out
}

/** Ключи направлений, как у IDE: соль - SHA-256 текста соли, метки - aw/v1. */
const directionKeys = async (salt: Uint8Array, ikm: Uint8Array): Promise<PhoneKeys> => ({
  fromAgent: await hkdf(salt, ikm, HKDF_INFO.agentToDevice, 32),
  toAgent: await hkdf(salt, ikm, HKDF_INFO.deviceToAgent, 32),
  prefixFromAgent: await hkdf(salt, ikm, HKDF_INFO.nonceAgentToDevice, 4),
  prefixToAgent: await hkdf(salt, ikm, HKDF_INFO.nonceDeviceToAgent, 4),
})

const aes = async (
  raw: Uint8Array,
  usage: 'encrypt' | 'decrypt',
  iv: Uint8Array,
  header: Uint8Array,
  data: Uint8Array,
) => {
  const key = await subtle.importKey('raw', raw, 'AES-GCM', false, [usage])
  const params = { name: 'AES-GCM', iv, additionalData: header, tagLength: 128 }

  return new Uint8Array(
    usage === 'encrypt'
      ? await subtle.encrypt(params, key, data)
      : await subtle.decrypt(params, key, data),
  )
}

/** Ждать, пока условие станет правдой; не дождались - ошибка с подписью. */
export const until = async <T>(
  probe: () => T | null | undefined,
  what: string,
  timeout = 3000,
): Promise<T> => {
  for (let waited = 0; waited < timeout; waited += 10) {
    const value = probe()

    if (value !== null && value !== undefined) return value

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error(`timed out waiting for ${what}`)
}

export class WebCryptoPhone {
  readonly deviceId: string
  /** Запечатанные слова IDE по порядку прихода. */
  readonly inbox: Message[] = []
  /** Открытые ответы рукопожатия. */
  readonly replies: HandshakeReply[] = []
  private readonly address: Uint8Array
  private agent: Uint8Array = new Uint8Array(16)
  private agentId = ''
  private staticKeys: Pair | null = null
  private auth: Uint8Array | null = null
  private keys: PhoneKeys | null = null
  private counter = 0n
  private chain: Promise<void> = Promise.resolve()

  constructor(private readonly transport: (frame: Uint8Array) => void) {
    this.address = webcrypto.getRandomValues(new Uint8Array(16))
    this.deviceId = toBase64Url(this.address)
  }

  /** Кадр от релея; открытие асинхронное, порядок держит цепочка. */
  receive(raw: Uint8Array): void {
    this.chain = this.chain.then(() => this.open(raw)).catch(() => undefined)
  }

  /** Первый шаг пары: открыт адрес из QR, телефон доказывает, что видел код. */
  async pairInit(
    url: string,
    label = 'Test phone',
  ): Promise<{ secret: Uint8Array; fingerprint: string; ephemeral: Pair }> {
    const code = parsePairingFragment(new URL(url).hash)

    if (!code) throw new Error('not a pairing code of this IDE')

    this.agentId = code.agentId
    this.agent = fromBase64Url(code.agentId) ?? new Uint8Array(16)
    this.staticKeys = await keyPair()

    const ephemeral = await keyPair()
    const staticPub = await spki(this.staticKeys.publicKey)
    const ephemeralPub = await spki(ephemeral.publicKey)
    const proof = await mac(code.secret, [
      PAIR_PROOF_LABEL,
      code.agentId,
      staticPub,
      ephemeralPub,
      this.deviceId,
    ])

    this.plain({
      p: 1,
      k: 'pairInit',
      deviceId: this.deviceId,
      label,
      staticPub,
      ephemeralPub,
      proof: toBase64(proof),
    })

    return { secret: code.secret, fingerprint: code.fingerprint, ephemeral }
  }

  /** Человек нажал Approve: ответ IDE проверен (доказательство и отпечаток из QR), ключи пары выведены. */
  async pairAck(offer: {
    secret: Uint8Array
    fingerprint: string
    ephemeral: Pair
  }): Promise<void> {
    const ack = await until(() => this.replies.find((reply) => reply.k === 'pairAck'), 'pairAck')

    if (ack.k !== 'pairAck' || !this.staticKeys) throw new Error('no pairAck')

    const expected = await mac(offer.secret, [
      PAIR_ACK_LABEL,
      this.agentId,
      this.deviceId,
      ack.staticPub,
      ack.ephemeralPub,
    ])
    const print = fingerprintOf(
      await sha256(fromBase64(ack.staticPub) ?? new Uint8Array(0)),
    ).replaceAll(' ', '')

    if (toBase64(expected) !== ack.proof) throw new Error('IDE proof does not match')
    if (print !== offer.fingerprint) throw new Error('IDE key is not the one in the QR code')

    const staticSecret = await agree(this.staticKeys.privateKey, ack.staticPub)
    const salt = await sha256(
      new TextEncoder().encode(
        sessionSaltText(
          this.agentId,
          this.deviceId,
          ack.ephemeralPub,
          await spki(offer.ephemeral.publicKey),
        ),
      ),
    )

    this.auth = await hkdf(new Uint8Array(0), staticSecret, HKDF_INFO.auth, 32)
    this.keys = await directionKeys(
      salt,
      concat(staticSecret, await agree(offer.ephemeral.privateKey, ack.ephemeralPub), offer.secret),
    )
    this.counter = 0n
  }

  /** Вернулся без QR: свежий эфемерный ключ, за который ручается долгий. */
  async resume(timeout = 3000): Promise<void> {
    if (!this.auth) throw new Error('not paired')

    const resume = await keyPair()
    const resumePub = await spki(resume.publicKey)

    this.replies.length = 0
    this.plain({ p: 1, k: 'sessionInit', deviceId: this.deviceId, ephemeralPub: resumePub })

    const ack = await until(
      () => this.replies.find((reply) => reply.k === 'sessionAck'),
      'sessionAck',
      timeout,
    )

    if (ack.k !== 'sessionAck') throw new Error('no sessionAck')

    const salt = await sha256(
      new TextEncoder().encode(
        sessionSaltText(this.agentId, this.deviceId, ack.ephemeralPub, resumePub),
      ),
    )

    this.keys = await directionKeys(
      salt,
      concat(await agree(resume.privateKey, ack.ephemeralPub), this.auth),
    )
    this.counter = 0n
  }

  /** Запечатанное слово IDE. */
  async send(message: object): Promise<void> {
    if (!this.keys) throw new Error('no keys yet')

    this.counter += 1n

    const header = encodeHeader(FRAME_SEALED, this.agent, this.address, this.counter)
    const sealed = await aes(
      this.keys.toAgent,
      'encrypt',
      nonceOf(this.keys.prefixToAgent, this.counter),
      header,
      encodeBody(message),
    )

    this.transport(encodeFrame(FRAME_SEALED, this.agent, this.address, this.counter, sealed))
  }

  /** Дождаться слова IDE этого вида (и условия), начиная с from-го в ящике. */
  next(
    kind: string,
    match: (message: Message) => boolean = () => true,
    from = 0,
  ): Promise<Message> {
    return until(
      () => this.inbox.slice(from).find((message) => message.k === kind && match(message)),
      kind,
    )
  }

  private plain(body: object) {
    this.transport(encodeFrame(FRAME_SEALED, this.agent, this.address, 0n, encodeBody(body)))
  }

  private async open(raw: Uint8Array) {
    const frame = decodeFrame(raw)

    if (frame.type !== FRAME_SEALED) return

    if (frame.counter === 0n) {
      const reply = parseHandshakeReply(decodeBody(frame.body))

      if (reply) this.replies.push(reply)

      return
    }

    if (!this.keys) return

    const header = encodeHeader(frame.type, frame.to, frame.from, frame.counter)
    const body = await aes(
      this.keys.fromAgent,
      'decrypt',
      nonceOf(this.keys.prefixFromAgent, frame.counter),
      header,
      frame.body,
    )
    const message = parseAgentMessage(decodeBody(body))

    if (message) this.inbox.push(message)
  }
}
