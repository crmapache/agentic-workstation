/**
 * Что телефон помнит между запусками: свой адрес на релее и пары с IDE. Закрытый ключ пары -
 * неизвлекаемый CryptoKey: IndexedDB хранит его как есть, а выгрузить байты не может никто,
 * даже этот код. Ключи соединений здесь не живут: они только в памяти и новые на каждом запуске.
 */

/** Этот телефон: один адрес на релее на все IDE - одна линия, а не по сокету на каждую. */
export type DeviceIdentity = {
  /** Адрес на релее: первые 16 байт SHA-256 ключа подписи (relay-claim.ts), base64url. */
  deviceId: string
  /** Как телефон назвался в последней паре: подставляется в следующую. */
  label: string
  /** Закрытый ключ подписи, неизвлекаемый: им телефон доказывает релею, что адрес его. */
  signingKey: CryptoKey
  /** Его открытая половина (SPKI) - едет в ответе на вызов релея. */
  signingSpki: Uint8Array
}

/** Пара с одной IDE. */
export type MachineRecord = {
  /** Адрес IDE на релее. */
  agentId: string
  /** Релей, через который шла пара: wss:// того же хоста, что и страница. */
  relayUrl: string
  /** Как IDE назвала себя в ответе на пару. */
  label: string
  /** Ключ IDE: по нему выводится долгий ключ пары при каждом переподключении. */
  agentStaticPub: string
  /** Отпечаток ключа IDE, 16 знаков hex без пробелов. */
  fingerprint: string
  /** Свой закрытый ключ этой пары, неизвлекаемый. */
  staticPrivateKey: CryptoKey
  staticPub: string
  pairedAt: number
  /** IDE отпустила телефон: ключи больше ничего не открывают, нужна новая пара. */
  revoked: boolean
}

export type KeyStore = {
  /** Помнит ли хранилище после перезапуска (IndexedDB) или только в памяти. */
  readonly persistent: boolean
  loadDevice: () => Promise<DeviceIdentity | null>
  saveDevice: (device: DeviceIdentity) => Promise<void>
  loadMachines: () => Promise<MachineRecord[]>
  saveMachine: (machine: MachineRecord) => Promise<void>
  removeMachine: (agentId: string) => Promise<void>
}

/** Хранилище в памяти: тесты и браузер без IndexedDB (приватный режим старых Safari). */
export const memoryKeyStore = (): KeyStore => {
  let device: DeviceIdentity | null = null
  const machines = new Map<string, MachineRecord>()

  return {
    persistent: false,
    loadDevice: () => Promise.resolve(device),
    saveDevice: (next) => {
      device = next

      return Promise.resolve()
    },
    loadMachines: () => Promise.resolve([...machines.values()]),
    saveMachine: (machine) => {
      machines.set(machine.agentId, machine)

      return Promise.resolve()
    },
    removeMachine: (agentId) => {
      machines.delete(agentId)

      return Promise.resolve()
    },
  }
}
