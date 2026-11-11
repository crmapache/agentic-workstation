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
  HKDF_INFO,
  fingerprintOf,
  REVOKED_LABEL,
  PAIR_ACK_LABEL,
  sessionSaltText,
  PAIR_PROOF_LABEL,
} from '@agentic-workstation/remote-protocol/crypto-spec'
import {
  decodeFrame,
  encodeFrame,
  FRAME_PROOF,
  encodeHeader,
  FRAME_SEALED,
  FRAME_CHALLENGE,
} from '@agentic-workstation/remote-protocol/frame'
import { parsePairingFragment } from '@agentic-workstation/remote-protocol/pairing-url'
import { proofBody, claimInput } from '@agentic-workstation/remote-protocol/relay-claim'

import type { Pair, Message, Signing, PhoneKeys } from './webcrypto-kit'
import {
  aes,
  mac,
  hkdf,
  spki,
  agree,
  until,
  concat,
  sha256,
  subtle,
  keyPair,
  signingKey,
  directionKeys,
} from './webcrypto-kit'

export type { Message } from './webcrypto-kit'

export { mac, until } from './webcrypto-kit'

/**
 * Телефон Remote Control, написанный на WebCrypto - тем же API, каким считает браузер
 * телефона, и независимо от `node:crypto` IDE. Общие у них только метки и формат
 * (packages/remote-protocol). С ним тесты проходят дорогу телефона до настоящего агента IDE и
 * обратно - напрямую через подделку сокета или через настоящий релей. Образец для apps/phone.
 */

export class WebCryptoPhone {
  readonly deviceId: string
  /** Запечатанные слова IDE по порядку прихода. */
  readonly inbox: Message[] = []
  /** Открытые ответы рукопожатия. */
  readonly replies: HandshakeReply[] = []
  /** Ответил ли телефон на вызов релея - адрес его на этой линии. */
  proven = false
  private readonly address: Uint8Array
  private agent: Uint8Array = new Uint8Array(16)
  private agentId = ''
  private staticKeys: Pair | null = null
  private auth: Uint8Array | null = null
  private keys: PhoneKeys | null = null
  private counter = 0n
  private chain: Promise<void> = Promise.resolve()

  private constructor(
    private transport: (frame: Uint8Array) => void,
    private readonly signing: Signing,
  ) {
    this.address = signing.address
    this.deviceId = toBase64Url(this.address)
  }

  /** Телефон со своим ключом подписи: адрес - из него, как требует релей. */
  static async create(transport: (frame: Uint8Array) => void): Promise<WebCryptoPhone> {
    return new WebCryptoPhone(transport, await signingKey())
  }

  /** Кадр от релея; открытие асинхронное, порядок держит цепочка. */
  receive(raw: Uint8Array): void {
    this.chain = this.chain.then(() => this.open(raw)).catch(() => undefined)
  }

  /** Куда слать кадры дальше: тест подменяет дорогу (чужой сокет, переписанный заголовок). */
  onSend(transport: (frame: Uint8Array) => void): void {
    this.transport = transport
  }

  /** Тег «тебя отпустили» сходится с долгим ключом этой пары. */
  async revokedTagValid(tag: string): Promise<boolean> {
    if (!this.auth) return false

    return toBase64(await mac(this.auth, [REVOKED_LABEL, this.agentId, this.deviceId])) === tag
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

  /** Вызов релея: подпись ключом телефона над текстом входа устройства. */
  private async answerChallenge(challenge: Uint8Array) {
    const signature = new Uint8Array(
      await subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        this.signing.pair.privateKey,
        claimInput('device', this.deviceId, challenge),
      ),
    )

    this.transport(
      encodeFrame(
        FRAME_PROOF,
        new Uint8Array(16),
        this.address,
        0n,
        proofBody(this.signing.spki, signature),
      ),
    )
    this.proven = true
  }

  private async open(raw: Uint8Array) {
    const frame = decodeFrame(raw)

    if (frame.type === FRAME_CHALLENGE) return this.answerChallenge(frame.body)
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
