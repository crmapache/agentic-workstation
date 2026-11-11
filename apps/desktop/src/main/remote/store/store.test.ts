import { it, expect, describe } from 'vitest'

import type { JsonFile } from '../../storage/json-file'
import type { StoredRemote } from './remote-state'
import {
  withDevice,
  emptyRemote,
  withRevoked,
  isSecureRelay,
  REMOTE_FORMAT,
  parseStoredRemote,
  REVOKED_REMEMBERED,
} from './remote-state'
import { RemoteStore } from './remote-store'

const ID = 'A'.repeat(22)

const device = { id: ID, label: 'iPhone', fingerprint: 'ABCD', pairedAt: 1, lastSeenAt: 2 }

describe('что Remote Control хранит на диске', () => {
  it('негодный файл и файл прежнего удалённого доступа (ACC) - выключено, без телефонов', () => {
    expect(parseStoredRemote(null)).toEqual(emptyRemote())
    expect(
      parseStoredRemote({ enabled: true, agentId: ID, devices: [device], relay: 'wss://x' }),
    ).toEqual(emptyRemote())
    expect(
      parseStoredRemote({
        format: REMOTE_FORMAT,
        enabled: 'yes',
        devices: [{ id: '../x' }],
        agentId: 'short',
      }),
    ).toMatchObject({ enabled: false, devices: [], agentId: '' })
    expect(
      parseStoredRemote({ format: REMOTE_FORMAT, enabled: true, devices: [device] }),
    ).toMatchObject({
      enabled: true,
      devices: [device],
    })
  })

  it('отзыв убирает телефон и секрет и ставит надгробие; надгробий - не больше потолка', () => {
    const revoked = withRevoked(withDevice(emptyRemote(), device, 'sealed'), ID)

    expect(revoked.devices).toEqual([])
    expect(revoked.secrets).toEqual({})
    expect(revoked.revoked).toEqual([ID])

    let many = revoked

    for (let index = 0; index < REVOKED_REMEMBERED + 5; index += 1) {
      many = withRevoked(many, `${String(index).padStart(2, '0')}${'B'.repeat(20)}`)
    }

    expect(many.revoked).toHaveLength(REVOKED_REMEMBERED)
    expect(withDevice(revoked, device, 'again').revoked).toEqual([])
  })

  it('релей - только wss://, ws:// - только localhost', () => {
    expect(isSecureRelay('wss://agentic-workstation-relay.mzpizote.com')).toBe(true)
    expect(isSecureRelay('ws://127.0.0.1:4460')).toBe(true)
    expect(isSecureRelay('ws://localhost.example.com')).toBe(false)
    expect(isSecureRelay('https://relay.example')).toBe(false)
    expect(isSecureRelay('nonsense')).toBe(false)
  })
})

describe('ключи - только через хранилище', () => {
  const fileWith = (stored: StoredRemote | null = null) => {
    const written: StoredRemote[] = []
    const file = {
      read: () => Promise.resolve(stored),
      write: (value: StoredRemote) => {
        written.push(value)

        return Promise.resolve()
      },
    } as unknown as JsonFile<StoredRemote>

    return { file, written }
  }

  const sealing = {
    available: () => true,
    seal: (plain: Buffer) => `sealed:${plain.toString('hex')}`,
    open: (sealed: string) =>
      sealed.startsWith('sealed:') ? Buffer.from(sealed.slice(7), 'hex') : null,
  }

  const bare = { available: () => false, seal: () => '', open: () => null }

  it('ключ IDE и секрет пары лежат запечатанными', async () => {
    const { file, written } = fileWith()
    const store = await RemoteStore.load(file, sealing)

    expect(store.hasIdentity).toBe(false)
    store.identity()
    store.remember(device, Buffer.from('secret'))
    await store.flush()

    const saved = written.at(-1)!

    expect(saved.format).toBe(REMOTE_FORMAT)
    expect(saved.identity.startsWith('sealed:')).toBe(true)
    expect(saved.secrets[ID]).toBe(`sealed:${Buffer.from('secret').toString('hex')}`)
    expect(saved.devices).toEqual([device])
  })

  it('без хранилища пара живёт в памяти, а на диск не пишется ни телефон, ни ключ, ни адрес', async () => {
    const { file, written } = fileWith()
    const store = await RemoteStore.load(file, bare)

    store.identity()
    store.remember(device, Buffer.from('secret'))
    await store.flush()

    expect(written.at(-1)).toMatchObject({ devices: [], secrets: {}, identity: '', agentId: '' })
    expect(store.devices).toEqual([device])
    expect(store.deviceSecret(ID)?.toString()).toBe('secret')
    expect(store.keysKept).toBe(false)
  })

  it('телефоны, чьи секреты не открываются, при загрузке - в отпущенных', async () => {
    const other = { ...device, id: 'C'.repeat(22) }
    const stored = {
      ...withDevice(withDevice(emptyRemote(), device, 'sealed:aa'), other, 'broken'),
      enabled: true,
    }
    const kept = await RemoteStore.load(fileWith(stored).file, sealing)

    expect(kept.devices.map((one) => one.id)).toEqual([ID])
    expect(kept.wasRevoked(other.id)).toBe(true)

    // Хранилища нет вовсе (другой Mac, нет Связки ключей): отпущены все.
    const lost = await RemoteStore.load(fileWith(stored).file, bare)

    expect(lost.devices).toEqual([])
    expect(lost.wasRevoked(ID)).toBe(true)
  })

  it('ключ IDE не открылся - новый ключ и новый адрес: две копии профиля не делят один адрес', async () => {
    const { file, written } = fileWith()
    const first = await RemoteStore.load(file, sealing)

    first.identity()
    await first.flush()

    const saved = written.at(-1)!
    const same = await RemoteStore.load(fileWith(saved).file, sealing)

    expect(same.agentId()).toBe(saved.agentId)

    const moved = await RemoteStore.load(fileWith(saved).file, {
      ...sealing,
      open: () => null,
    })

    expect(moved.agentId()).not.toBe(saved.agentId)
  })
})
