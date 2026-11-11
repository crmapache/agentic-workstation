import { createHash } from 'node:crypto'

import { it, expect, describe } from 'vitest'

import { revokedTag } from '../wire/crypto'
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
    // Прежний формат со случайным адресом: такой адрес релей без подписи больше не отдаёт.
    expect(
      parseStoredRemote({ format: 'aw-remote/1', enabled: true, agentId: ID, devices: [device] }),
    ).toEqual(emptyRemote())
    expect(
      parseStoredRemote({
        format: REMOTE_FORMAT,
        enabled: 'yes',
        devices: [{ id: '../x' }],
        revoked: ['old-string-form', { id: ID, tag: 'dGFn' }],
      }),
    ).toMatchObject({ enabled: false, devices: [], revoked: [{ id: ID, tag: 'dGFn' }] })
    expect(
      parseStoredRemote({ format: REMOTE_FORMAT, enabled: true, devices: [device] }),
    ).toMatchObject({
      enabled: true,
      devices: [device],
    })
  })

  it('отзыв убирает телефон и секрет и ставит надгробие; надгробий - не больше потолка', () => {
    const revoked = withRevoked(withDevice(emptyRemote(), device, 'sealed'), ID, 'tag')

    expect(revoked.devices).toEqual([])
    expect(revoked.secrets).toEqual({})
    expect(revoked.revoked).toEqual([{ id: ID, tag: 'tag' }])

    let many = revoked

    for (let index = 0; index < REVOKED_REMEMBERED + 5; index += 1) {
      many = withRevoked(many, `${String(index).padStart(2, '0')}${'B'.repeat(20)}`, '')
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

  it('ключи IDE и секрет пары лежат запечатанными, адрес - начало SHA-256 ключа подписи', async () => {
    const { file, written } = fileWith()
    const store = await RemoteStore.load(file, sealing)

    expect(store.hasIdentity).toBe(false)
    store.identity()
    store.remember(device, Buffer.from('secret'))
    store.remember({ ...device, id: 'D'.repeat(22) }, Buffer.from('other secret'))

    const tag = store.revoke('D'.repeat(22))

    await store.flush()

    const saved = written.at(-1)!
    const spki = store.signing().publicKey.export({ type: 'spki', format: 'der' })

    expect(store.agentId()).toBe(
      createHash('sha256').update(spki).digest().subarray(0, 16).toString('base64url'),
    )
    expect(saved.format).toBe(REMOTE_FORMAT)
    expect(saved.identity.startsWith('sealed:')).toBe(true)
    expect(saved.signing.startsWith('sealed:')).toBe(true)
    expect(saved).not.toHaveProperty('agentId')
    // Тег - HMAC долгим ключом пары, посчитанный до того, как ключ ушёл.
    expect(tag).toBe(
      revokedTag(Buffer.from('other secret'), store.agentId(), 'D'.repeat(22)).toString('base64'),
    )
    expect(saved.revoked).toEqual([{ id: 'D'.repeat(22), tag }])
    expect(store.revokedTag('D'.repeat(22))).toBe(tag)
    expect(saved.secrets[ID]).toBe(`sealed:${Buffer.from('secret').toString('hex')}`)
    expect(saved.devices).toEqual([device])
  })

  it('без хранилища пара живёт в памяти, а на диск не пишется ни телефон, ни ключ, ни адрес', async () => {
    const { file, written } = fileWith()
    const store = await RemoteStore.load(file, bare)

    store.identity()
    store.remember(device, Buffer.from('secret'))
    await store.flush()

    expect(written.at(-1)).toMatchObject({ devices: [], secrets: {}, identity: '', signing: '' })
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
    // Отпущен, но без тега: ключа пары нет, и сказать ему «тебя отпустили» нечем.
    expect(kept.revokedTag(other.id)).toBeNull()

    // Хранилища нет вовсе (другой Mac, нет Связки ключей): отпущены все.
    const lost = await RemoteStore.load(fileWith(stored).file, bare)

    expect(lost.devices).toEqual([])
    expect(lost.revokedTag(ID)).toBeNull()
  })

  const SUBSCRIPTION = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: Buffer.from(
      Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 4 : index)),
    ).toString('base64url'),
    auth: Buffer.alloc(16, 7).toString('base64url'),
  }

  it('подписка на пуши - запечатанной у пары, переживает перезапуск, уходит с отзывом и новой парой', async () => {
    const { file, written } = fileWith()
    const store = await RemoteStore.load(file, sealing)

    store.identity()
    store.remember(device, Buffer.from('secret'))

    expect(store.setPush('Z'.repeat(22), SUBSCRIPTION)).toBe(false)
    expect(store.setPush(ID, SUBSCRIPTION)).toBe(true)
    expect(store.setPush(ID, { ...SUBSCRIPTION })).toBe(false)
    await store.flush()

    const saved = written.at(-1)!

    expect(saved.pushes[ID]?.startsWith('sealed:')).toBe(true)
    expect(JSON.stringify(saved)).not.toContain('fcm.googleapis.com')

    const again = await RemoteStore.load(fileWith(saved).file, sealing)

    expect(again.pushOf(ID)).toEqual(SUBSCRIPTION)
    expect(again.pushDevices()).toEqual([ID])

    // Новая пара того же телефона - новый ключ пуша: прежняя подписка не годится.
    again.remember(device, Buffer.from('new secret'))
    expect(again.hasPush(ID)).toBe(false)

    again.setPush(ID, SUBSCRIPTION)
    again.revoke(ID)
    await again.flush()
    expect(again.pushOf(ID)).toBeNull()
    expect(withRevoked(saved, ID, '').pushes).toEqual({})
  })

  it('подписка без хранилища - только в памяти; запечатанная не открылась - её нет', async () => {
    const { file, written } = fileWith()
    const store = await RemoteStore.load(file, bare)

    store.identity()
    store.remember(device, Buffer.from('secret'))
    store.setPush(ID, SUBSCRIPTION)
    await store.flush()

    expect(store.pushOf(ID)).toEqual(SUBSCRIPTION)
    expect(written.at(-1)?.pushes).toEqual({})

    const broken = { ...withDevice(emptyRemote(), device, 'sealed:aa'), pushes: { [ID]: 'junk' } }
    const loaded = await RemoteStore.load(fileWith(broken).file, sealing)

    expect(loaded.pushOf(ID)).toBeNull()
    expect(parseStoredRemote({ format: REMOTE_FORMAT, devices: [device] }).pushes).toEqual({})
  })

  it('ключ IDE не открылся - новый ключ и новый адрес: две копии профиля не делят один адрес', async () => {
    const { file, written } = fileWith()
    const first = await RemoteStore.load(file, sealing)

    first.identity()
    await first.flush()

    const saved = written.at(-1)!
    const same = await RemoteStore.load(fileWith(saved).file, sealing)

    expect(same.agentId()).toBe(first.agentId())

    // Ключ подписи не открылся (а секрет пары - да): новые ключи, новый адрес, пары - в отпущенных.
    const withPhone = { ...withDevice(saved, device, 'sealed:aa'), signing: 'broken' }
    const moved = await RemoteStore.load(fileWith(withPhone).file, sealing)

    expect(moved.devices).toHaveLength(1)
    expect(moved.agentId()).not.toBe(first.agentId())
    expect(moved.devices).toEqual([])
  })
})
