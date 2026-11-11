import type { SessionAck } from '@agentic-workstation/remote-protocol/agent-messages'
import { fromBase64Url } from '@agentic-workstation/remote-protocol/base64'
import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import type { Frame } from '@agentic-workstation/remote-protocol/frame'
import { encodeFrame, encodeHeader, FRAME_SEALED } from '@agentic-workstation/remote-protocol/frame'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

import type { SessionKeys } from './crypto'
import { open, seal, exportPublic, generateKeyPair, deriveResumeKeys } from './crypto'
import type { MachineRecord } from './keystore'
import { ReplayWindow } from './replay-window'

/**
 * connecting - рукопожатие в пути; online - ключи есть и IDE недавно отвечала; offline - IDE не
 * отвечает (не на релее, Remote Control выключен, ноутбук спит); revoked - IDE отпустила телефон.
 */
export type LinkStatus = 'connecting' | 'online' | 'offline' | 'revoked'

type Handshake = { pair: CryptoKeyPair; pub: string; sentAt: number }

/**
 * Шифрованное состояние линии с одной IDE: ключи соединения, свой счётчик, окно повторов и
 * рукопожатие в пути. Только в памяти: ключи не переживают страницу, и старый счётчик не
 * встретит старый ключ - то единственное правило GCM, от нарушения которого всё рушится.
 */
export class MachineSession {
  status: LinkStatus = 'connecting'
  /** С какого момента это состояние (часы телефона). */
  statusAt = 0
  /** Когда IDE последний раз сказала что-то, что открылось (часы телефона). */
  lastHeard = 0
  /** Когда телефон стучал последний раз (ping) и номер стука - pong IDE несёт его же. */
  lastPing = 0
  pingN = 0
  /** С какого стука телефон ждёт ответа IDE; 0 - не ждёт (ответ пришёл). */
  awaitingPong = 0
  /** Что умеет IDE (caps инвентаря): parts - сообщение частями. */
  caps: readonly string[] = []
  readonly agentAddress: Uint8Array
  private keys: SessionKeys | null = null
  private outgoing = 0n
  private replay = new ReplayWindow()
  private handshake: Handshake | null = null
  /** Печать асинхронная, а счётчик строго растёт: кадры уходят в порядке номеров. */
  private sealing: Promise<unknown> = Promise.resolve()

  constructor(
    public record: MachineRecord,
    private readonly deviceId: string,
    private readonly deviceAddress: Uint8Array,
  ) {
    this.agentAddress = fromBase64Url(record.agentId) ?? new Uint8Array(16)
  }

  get agentId(): string {
    return this.record.agentId
  }

  get isOpen(): boolean {
    return this.keys !== null
  }

  /** Когда ушла просьба о ключах, которая ещё без ответа; 0 - такой нет. */
  get handshakeSentAt(): number {
    return this.handshake?.sentAt ?? 0
  }

  /**
   * Открытый кадр «вот мой свежий ключ» (sessionInit). fresh - новый ключ (новая линия или
   * «твои ключи не наши»); иначе - тот же, что ждёт ответа: копия из ящика релея получит тот же
   * ответ, и ключи сторон не разойдутся. Ключ, на который уже пришёл ответ, не повторяется
   * никогда (crypto-spec.ts): open и close забывают его, и следующий - всегда новый.
   */
  async sessionInit(fresh: boolean, now: number): Promise<Uint8Array> {
    if (fresh || !this.handshake) {
      const pair = await generateKeyPair()

      this.handshake = { pair, pub: await exportPublic(pair.publicKey), sentAt: now }
    } else {
      this.handshake.sentAt = now
    }

    return this.plain({
      p: PROTOCOL_VERSION,
      k: 'sessionInit',
      deviceId: this.deviceId,
      ephemeralPub: this.handshake.pub,
    })
  }

  /** Ответ IDE на свежий ключ. false - не на тот ключ (старая копия из ящика) или кривой. */
  async sessionAck(ack: SessionAck): Promise<boolean> {
    const handshake = this.handshake

    if (!handshake || ack.for !== handshake.pub) return false

    try {
      this.open(
        await deriveResumeKeys({
          agentId: this.agentId,
          deviceId: this.deviceId,
          agentEphemeralPub: ack.ephemeralPub,
          deviceEphemeralPub: handshake.pub,
          staticPrivate: this.record.staticPrivateKey,
          agentStaticPub: this.record.agentStaticPub,
          ephemeralPrivate: handshake.pair.privateKey,
        }),
      )
    } catch {
      return false
    }

    return true
  }

  /** Ключи готовы (после пары или переподключения): счёт и окно - заново. */
  open(keys: SessionKeys): void {
    this.keys = keys
    this.outgoing = 0n
    this.replay = new ReplayWindow()
    this.handshake = null
  }

  /** Ключи больше не годятся (IDE их не знает, отпустила телефон, линия оборвалась). */
  close(): void {
    this.keys = null
    this.handshake = null
  }

  /** Запечатанное слово IDE; ключей нет - null. Номер берётся до печати: порядок кадров держит цепочка. */
  sealed(message: object): Promise<Uint8Array | null> {
    const keys = this.keys

    if (!keys) return Promise.resolve(null)

    this.outgoing += 1n

    const counter = this.outgoing
    const header = encodeHeader(FRAME_SEALED, this.agentAddress, this.deviceAddress, counter)
    const work = this.sealing.then(async () => {
      const body = await seal(
        keys.toAgent,
        keys.prefixToAgent,
        counter,
        header,
        encodeBody(message),
      )

      return encodeFrame(FRAME_SEALED, this.agentAddress, this.deviceAddress, counter, body)
    })

    this.sealing = work.catch(() => undefined)

    return work
  }

  /**
   * Открыть кадр IDE. Тег проверяется раньше окна повторов: счётчик лежит в открытом заголовке,
   * и выдуманный номер, сдвинувший окно, глушил бы потом все настоящие кадры.
   */
  async openFrame(frame: Frame): Promise<Uint8Array | 'replayed' | null> {
    const keys = this.keys

    if (!keys) return null

    const header = encodeHeader(frame.type, frame.to, frame.from, frame.counter)
    const body = await open(keys.fromAgent, keys.prefixFromAgent, frame.counter, header, frame.body)

    if (!body) return null
    if (this.keys !== keys) return null

    return this.replay.accept(frame.counter) ? body : 'replayed'
  }

  /** Открытое слово рукопожатия: счётчик 0, ключа ещё нет - этот кадр его и даёт. */
  plain(message: object): Uint8Array {
    return encodeFrame(FRAME_SEALED, this.agentAddress, this.deviceAddress, 0n, encodeBody(message))
  }
}
