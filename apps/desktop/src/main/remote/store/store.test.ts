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
  const written: StoredRemote[] = []
  const file = {
    read: () => Promise.resolve(null),
    write: (value: StoredRemote) => {
      written.push(value)

      return Promise.resolve()
    },
  } as unknown as JsonFile<StoredRemote>

  it('ключ IDE и секрет пары лежат запечатанными, а без хранилища - только в памяти', async () => {
    const vault = {
      available: () => true,
      seal: (plain: Buffer) => `sealed:${plain.toString('hex')}`,
      open: () => null,
    }
    const store = await RemoteStore.load(file, vault)

    expect(store.hasIdentity).toBe(false)
    store.identity()
    store.remember(device, Buffer.from('secret'))
    await store.flush()

    const saved = written.at(-1)!

    expect(saved.format).toBe(REMOTE_FORMAT)
    expect(saved.identity.startsWith('sealed:')).toBe(true)
    expect(saved.secrets[ID]).toBe(`sealed:${Buffer.from('secret').toString('hex')}`)

    const bare = await RemoteStore.load(file, {
      available: () => false,
      seal: () => '',
      open: () => null,
    })

    bare.remember(device, Buffer.from('secret'))
    await bare.flush()

    expect(written.at(-1)!.secrets[ID]).toBe('')
    expect(written.at(-1)!.identity).toBe('')
    expect(bare.deviceSecret(ID)?.toString()).toBe('secret')
    expect(bare.keysKept).toBe(false)
  })
})
