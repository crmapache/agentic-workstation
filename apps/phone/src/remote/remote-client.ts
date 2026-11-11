import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { parseAgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { toBase64Url, fromBase64Url } from '@agentic-workstation/remote-protocol/base64'
import { decodeBody } from '@agentic-workstation/remote-protocol/body'
import type { CommandArgs, CommandName } from '@agentic-workstation/remote-protocol/commands'
import type { FeedView } from '@agentic-workstation/remote-protocol/feed'
import type { Frame } from '@agentic-workstation/remote-protocol/frame'
import {
  FRAME_SEALED,
  encodeAddress,
  FRAME_CONTROL,
} from '@agentic-workstation/remote-protocol/frame'
import type { PairingCode } from '@agentic-workstation/remote-protocol/pairing-url'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

import type { CommandOutcome } from './command-desk'
import { CommandDesk } from './command-desk'
import { Emitter } from './emitter'
import { Handshakes } from './handshakes'
import type { KeyStore, MachineRecord, DeviceIdentity } from './keystore'
import { Liveness } from './liveness'
import type { LinkStatus } from './machine-session'
import { MachineSession } from './machine-session'
import type { PairOutcome, PairingOffer } from './pairing'
import { prepareOffer } from './pairing'
import type { SocketLike, SocketState } from './relay-socket'
import { RelaySocket } from './relay-socket'
import type { WatchTarget } from './watch-desk'
import { WatchDesk } from './watch-desk'

export type ClientEvents = {
  /** Запечатанное слово IDE, уже открытое и разобранное. */
  message: (agentId: string, message: AgentMessage) => void
  /** Лента разговора после снимка или заплатки. */
  feed: (agentId: string, view: FeedView) => void
  status: (agentId: string, status: LinkStatus) => void
  /** Список пар поменялся: новая, забытая, отпущенная IDE. */
  machines: () => void
  /** Линия до релея этой страницы. */
  relay: (state: SocketState) => void
}

export type ClientOptions = {
  store: KeyStore
  /** Релей этой страницы (wss:// её хоста): через него идёт новая пара. */
  relayUrl: string
  createSocket: (url: string) => SocketLike
  client: { name: string; version: string }
  now?: () => number
}

/**
 * Телефон Remote Control без интерфейса: адрес на релее, линия до него, пары с IDE, рукопожатия,
 * печать, подписки и команды. React о нём ничего не знает, а он - о React: кэш окна слушает его
 * события (state/mirror.ts). Входящие кадры открываются строго по очереди - порядок заплаток
 * ленты держит цепочка, а не удача.
 */
export class RemoteClient {
  readonly events = new Emitter<ClientEvents>()
  readonly watches: WatchDesk
  readonly commands: CommandDesk
  private readonly sessions = new Map<string, MachineSession>()
  private readonly sockets = new Map<string, RelaySocket>()
  private readonly handshakes: Handshakes
  private readonly liveness: Liveness
  private device: DeviceIdentity | null
  private incoming: Promise<void> = Promise.resolve()

  private constructor(
    private readonly options: ClientOptions,
    device: DeviceIdentity | null,
  ) {
    this.device = device
    this.watches = new WatchDesk({
      send: (agentId, message) => void this.send(agentId, message),
      feedChanged: (agentId, view) => this.events.emit('feed', agentId, view),
      now: () => this.now(),
    })
    this.commands = new CommandDesk({
      send: (agentId, message) => this.send(agentId, message),
      whenOpen: (agentId, timeoutMs) => this.whenOpen(agentId, timeoutMs),
      caps: (agentId) => this.sessions.get(agentId)?.caps ?? [],
    })
    this.handshakes = new Handshakes({
      sessions: this.sessions,
      store: options.store,
      socketFor: (relayUrl) => this.socketFor(relayUrl),
      deviceOf: (label) => this.ensureDevice(label),
      opened: (session) => this.opened(session),
      setStatus: (session, status) => this.setStatus(session, status),
      machinesChanged: () => this.events.emit('machines'),
      add: (record) => this.addSession(record),
      now: () => this.now(),
    })
    this.liveness = new Liveness({
      sessions: () => [...this.sessions.values()],
      sockets: () => [...this.sockets.values()],
      socketOpen: (session) => this.socketFor(session.record.relayUrl).isOpen,
      send: (agentId, message) => this.send(agentId, message),
      handshake: (session, fresh) => this.handshakes.begin(session, fresh),
      setStatus: (session, status) => this.setStatus(session, status),
      now: () => this.now(),
    })
  }

  static async create(options: ClientOptions): Promise<RemoteClient> {
    const client = new RemoteClient(options, await options.store.loadDevice())

    for (const record of await options.store.loadMachines()) client.addSession(record)

    return client
  }

  get persistent(): boolean {
    return this.options.store.persistent
  }

  /** Имя, которым телефон назвался в прошлой паре. */
  get savedLabel(): string {
    return this.device?.label ?? ''
  }

  /** На линию: релеи всех пар, часы проверки IDE. */
  start(): void {
    for (const session of this.sessions.values()) {
      if (!session.record.revoked) this.socketFor(session.record.relayUrl).start()
    }

    this.liveness.start()
  }

  stop(): void {
    this.liveness.stop()

    for (const socket of this.sockets.values()) socket.stop()
  }

  /** Страница снова на виду или сеть вернулась: не ждать отступа. */
  wake(): void {
    for (const socket of this.sockets.values()) socket.wake()

    this.liveness.tick()
  }

  machines(): MachineRecord[] {
    return [...this.sessions.values()]
      .map((session) => session.record)
      .sort((first, second) => first.pairedAt - second.pairedAt)
  }

  status(agentId: string): LinkStatus {
    return this.sessions.get(agentId)?.status ?? 'offline'
  }

  relayState(): SocketState {
    return this.sockets.get(this.options.relayUrl)?.state ?? 'idle'
  }

  preparePairing(code: PairingCode): Promise<PairingOffer> {
    return prepareOffer(code, this.options.relayUrl)
  }

  /** Пара: pairInit и ожидание Approve человека в IDE. */
  pair(offer: PairingOffer, label: string): Promise<PairOutcome> {
    return this.handshakes.pair(offer, label)
  }

  cancelPairing(): void {
    this.handshakes.cancelPairing()
  }

  watch(agentId: string, target: WatchTarget): () => void {
    return this.watches.watch(agentId, target)
  }

  command<N extends CommandName>(
    agentId: string,
    name: N,
    args: CommandArgs<N>,
  ): Promise<CommandOutcome> {
    return this.commands.run(agentId, name, args)
  }

  /** Переподключиться к IDE сейчас: новое рукопожатие, не дожидаясь часов. */
  reconnect(agentId: string): void {
    const session = this.sessions.get(agentId)

    if (!session || session.record.revoked) return

    this.setStatus(session, 'connecting')
    this.socketFor(session.record.relayUrl).wake()
    void this.handshakes.begin(session, true)
  }

  /** Забыть IDE на этом телефоне: ключи пары стираются, IDE отзывает телефон у себя сама. */
  async forget(agentId: string): Promise<void> {
    const session = this.sessions.get(agentId)

    session?.close()
    this.sessions.delete(agentId)
    this.watches.forget(agentId)
    this.commands.failAll(agentId, 'gone')
    await this.options.store.removeMachine(agentId)
    this.events.emit('machines')
  }

  /** Кадр от релея - в общую очередь: открытие асинхронное, порядок держит цепочка. */
  receive(frame: Frame): void {
    this.incoming = this.incoming.then(() => this.open(frame)).catch(() => undefined)
  }

  /** Запечатанное слово IDE; ключей или линии нет - false. */
  async send(agentId: string, message: object): Promise<boolean> {
    const session = this.sessions.get(agentId)
    const frame = session ? await session.sealed(message) : null

    return frame !== null && !!session && this.socketFor(session.record.relayUrl).send(frame)
  }

  private async open(frame: Frame) {
    const agentId = encodeAddress(frame.from)
    const session = this.sessions.get(agentId)

    // Слово релея «у тебя была дыра»: всё, что смотрим, - заново со своего номера.
    if (frame.type === FRAME_CONTROL) {
      if (session?.isOpen) this.catchUp(session)

      return
    }

    if (frame.type !== FRAME_SEALED) return
    if (frame.counter === 0n) return this.handshakes.reply(agentId, frame.body)
    if (!session) return

    const opened = await session.openFrame(frame)

    if (opened === null || opened === 'replayed') return

    const message = parseAgentMessage(decodeBody(opened))

    if (!message) return

    session.lastHeard = this.now()
    this.setStatus(session, 'online')
    this.dispatch(session, message)
  }

  private dispatch(session: MachineSession, message: AgentMessage) {
    const { agentId } = session

    switch (message.k) {
      case 'inventory':
        session.caps = message.caps
        break
      case 'feed':
        this.watches.snapshot(agentId, message)
        break
      case 'patch':
        this.watches.patch(agentId, message)
        break
      case 'conversationGone':
        this.watches.gone(agentId, message.conversationId)
        break
      case 'result':
        this.commands.result(message)
        break
      case 'resync':
        this.watches.resubscribeAll(agentId)
        break
      case 'revoked':
        void this.handshakes.revoked(session)
        break
    }

    this.events.emit('message', agentId, message)
  }

  /** Ключи с IDE готовы: представиться, получить список и вернуть подписки. */
  private opened(session: MachineSession) {
    session.lastHeard = this.now()
    session.probeAt = 0
    this.setStatus(session, 'online')
    void this.send(session.agentId, {
      p: PROTOCOL_VERSION,
      k: 'hello',
      client: this.options.client,
    })
    this.watches.resubscribeAll(session.agentId)
  }

  private catchUp(session: MachineSession) {
    void this.send(session.agentId, { p: PROTOCOL_VERSION, k: 'inventory' })
    this.watches.resubscribeAll(session.agentId)
  }

  private addSession(record: MachineRecord): MachineSession {
    const device = this.device

    if (!device) throw new Error('a pairing without a device identity')

    this.sessions.get(record.agentId)?.close()

    const session = new MachineSession(record, device.deviceId, deviceAddress(device))

    if (record.revoked) session.status = 'revoked'

    this.sessions.set(record.agentId, session)

    return session
  }

  private setStatus(session: MachineSession, status: LinkStatus) {
    if (session.status === status) return

    session.status = status
    session.statusAt = this.now()
    this.events.emit('status', session.agentId, status)
  }

  private socketFor(relayUrl: string): RelaySocket {
    const known = this.sockets.get(relayUrl)

    if (known) return known

    const device = this.device

    if (!device) throw new Error('no device identity yet')

    const socket = new RelaySocket({
      relayUrl,
      deviceId: device.deviceId,
      address: deviceAddress(device),
      onFrame: (frame) => this.receive(frame),
      onOpen: () => this.handshakes.lineOpened(relayUrl),
      onState: (state) => {
        if (state !== 'open') this.handshakes.lineLost(relayUrl, state)
        if (relayUrl === this.options.relayUrl) this.events.emit('relay', state)
      },
      createSocket: this.options.createSocket,
      now: () => this.now(),
    })

    this.sockets.set(relayUrl, socket)

    return socket
  }

  /** Свой адрес на релее: создаётся с первой парой и дальше один на все IDE. */
  private async ensureDevice(label: string): Promise<DeviceIdentity> {
    const device = this.device ?? {
      deviceId: toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(16))),
      label,
    }

    this.device = { ...device, label: label.trim() || device.label }
    await this.options.store.saveDevice(this.device)

    return this.device
  }

  private async whenOpen(agentId: string, timeoutMs: number): Promise<boolean> {
    for (let waited = 0; ; waited += 100) {
      const session = this.sessions.get(agentId)

      if (!session || session.record.revoked) return false
      if (session.isOpen) return true
      if (waited >= timeoutMs) return false

      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }
}

const deviceAddress = (device: DeviceIdentity): Uint8Array =>
  fromBase64Url(device.deviceId) ?? new Uint8Array(16)
