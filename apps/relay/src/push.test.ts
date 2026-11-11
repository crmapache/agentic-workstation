import { createECDH } from 'node:crypto'

import { it, expect, describe } from 'vitest'

import { encodePushBody } from '@agentic-workstation/remote-protocol/push'

import { readConfig } from './config.ts'
import type { PushOrder } from './push-frame.ts'
import { readPushBody, pushEndpointAllowed } from './push-frame.ts'
import type { PushKeys } from './push-keys.ts'
import { readPushKeys } from './push-keys.ts'
import { Pushes } from './push.ts'

/**
 * Пуши релея без сети: ключи VAPID - свои на каждый тест, служба пушей - подделка, которая
 * отвечает заданным кодом и записывает, что ей дали. Настоящим службам тесты не звонят.
 */

/** Пара VAPID, как её делает web-push: точка без сжатия и d ровно 32 байта. */
const testVapid = (): { publicKey: string; privateKey: string } => {
  for (;;) {
    const ecdh = createECDH('prime256v1')

    ecdh.generateKeys()

    const privateKey = ecdh.getPrivateKey()

    if (privateKey.length === 32) {
      return {
        publicKey: ecdh.getPublicKey().toString('base64url'),
        privateKey: privateKey.toString('base64url'),
      }
    }
  }
}

const KEYS: PushKeys = { ...testVapid(), subject: 'https://relay.example/privacy' }

const P256DH = Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 4 : index))

const AUTH = new Uint8Array(16).fill(7)

const IDE = Buffer.alloc(16, 0xa1)

const OTHER_IDE = Buffer.alloc(16, 0xb2)

const bodyFor = (endpoint: string, topic: Uint8Array | null = new Uint8Array(16).fill(3)) =>
  Buffer.from(
    encodePushBody({
      topic,
      p256dh: P256DH,
      auth: AUTH,
      endpoint,
      payload: new Uint8Array(64).fill(9),
    }),
  )

const APPLE = 'https://web.push.apple.com/QGuQyavXutnMH7j1g0kVHw'

/** Релей с подделкой службы пушей: status - что она ответит. */
const pushesWith = (
  over: { keys?: PushKeys | null; perMinute?: number; total?: number; inFlight?: number } = {},
) => {
  const sent: PushOrder[] = []
  const lines: string[] = []
  let status = 201
  /** Первый звонок висит, пока тест его не отпустит (inFlight задан). */
  const gate = { held: false, release: () => undefined as void }
  const pushes = new Pushes(
    over.keys === undefined ? KEYS : over.keys,
    {
      perMinute: over.perMinute ?? 30,
      totalPerMinute: over.total ?? 1200,
      ttlSeconds: 600,
      maxInFlight: over.inFlight ?? 64,
    },
    async (order, options) => {
      sent.push(order)
      expect(options.ttlSeconds).toBe(600)

      if (!gate.held && over.inFlight !== undefined) {
        gate.held = true
        await new Promise<void>((resolve) => {
          gate.release = resolve
        })
      }

      return status
    },
    (line) => lines.push(line),
  )

  return {
    pushes,
    sent,
    lines,
    answer: (next: number) => {
      status = next
    },
    release: () => gate.release(),
  }
}

describe('белый список служб пушей', () => {
  it('службы браузеров и их поддомены целым именем', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://android.googleapis.com/gcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      APPLE,
      'https://api.push.apple.com.web.push.apple.com/x',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      expect(pushEndpointAllowed(endpoint), endpoint).toBe(true)
    }
  })

  it('чужой хост, похожее имя, http, порт, логин и длинный адрес - нет', () => {
    for (const endpoint of [
      'https://evil.example/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evilfcm.googleapis.com/x',
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com:8443/fcm/send/abc',
      'https://user:pw@fcm.googleapis.com/x',
      'https://127.0.0.1/x',
      `https://fcm.googleapis.com/${'x'.repeat(1100)}`,
      'not a url',
    ]) {
      expect(pushEndpointAllowed(endpoint), endpoint).toBe(false)
    }
  })
})

describe('ключи VAPID', () => {
  it('без ключей пушей нет, и /v1/info это скажет', () => {
    const config = readConfig({})

    expect(config.push).toBeNull()
    expect(config.pushOff).toBe('no VAPID keys')
  })

  it('пара сходится - пуши есть; чужая пара, кривой ключ и адрес без https - нет', () => {
    const own = testVapid()
    const other = testVapid()
    const env = {
      RELAY_VAPID_PUBLIC: own.publicKey,
      RELAY_VAPID_PRIVATE: own.privateKey,
      RELAY_VAPID_SUBJECT: 'https://relay.example',
    }

    expect(readPushKeys(env).push).toEqual({ ...own, subject: 'https://relay.example' })
    expect(readPushKeys({ ...env, RELAY_VAPID_PRIVATE: other.privateKey }).pushOff).toContain(
      'does not match',
    )
    expect(readPushKeys({ ...env, RELAY_VAPID_PUBLIC: 'AAAA' }).push).toBeNull()
    expect(readPushKeys({ ...env, RELAY_VAPID_SUBJECT: 'http://relay.example' }).push).toBeNull()
    expect(readPushKeys({ ...env, RELAY_VAPID_SUBJECT: 'mailto:max@example.com' }).push).not.toBe(
      null,
    )
  })
})

describe('пуш от IDE', () => {
  it('службе уходят ключи браузера, тема и payload байт в байт', async () => {
    const { pushes, sent } = pushesWith()
    const body = bodyFor(APPLE)

    await pushes.take(IDE, body, 0, () => undefined)

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      endpoint: APPLE,
      p256dh: Buffer.from(P256DH).toString('base64url'),
      auth: Buffer.from(AUTH).toString('base64url'),
      topic: Buffer.alloc(16, 3).toString('base64url'),
    })
    expect(sent[0]?.payload.equals(Buffer.alloc(64, 9))).toBe(true)
    expect(readPushBody(body)?.topic).toHaveLength(22)
  })

  it('без ключей VAPID и с кривым телом служба не зовётся', async () => {
    const off = pushesWith({ keys: null })

    await off.pushes.take(IDE, bodyFor(APPLE), 0, () => undefined)
    expect(off.sent).toHaveLength(0)
    expect(off.pushes.enabled).toBe(false)
    expect(off.pushes.publicKey).toBe('')

    const on = pushesWith()

    await on.pushes.take(IDE, Buffer.from('junk'), 0, () => undefined)
    expect(on.sent).toHaveLength(0)
    expect(on.lines.at(-1)).toContain('could not read')

    // Ключ браузера - не точка P-256 без сжатия: шифровать для него нечем.
    const compressed = bodyFor(APPLE)

    compressed[17] = 0x02
    await on.pushes.take(IDE, compressed, 0, () => undefined)
    expect(readPushBody(compressed)).toBeNull()
    expect(on.sent).toHaveLength(0)
  })

  it('хост не из списка - отказ без звонка и «подписки нет» IDE', async () => {
    const { pushes, sent } = pushesWith()
    let gone = 0

    await pushes.take(IDE, bodyFor('https://evil.example/push'), 0, () => (gone += 1))

    expect(sent).toHaveLength(0)
    expect(gone).toBe(1)
  })

  it('404 и 410 - «подписки нет»; 500 и тишина - нет', async () => {
    const { pushes, answer, lines } = pushesWith()
    const gone: number[] = []

    for (const status of [410, 404, 500, 0, 429]) {
      answer(status)
      await pushes.take(IDE, bodyFor(APPLE), 0, () => gone.push(status))
    }

    expect(gone).toEqual([410, 404])
    expect(lines.join('\n')).not.toContain(APPLE)
  })

  it('предел на IDE: лишнее отброшено, другая IDE считается отдельно, через минуту - снова', async () => {
    const { pushes, sent } = pushesWith({ perMinute: 3 })

    for (let index = 0; index < 5; index += 1) {
      await pushes.take(IDE, bodyFor(APPLE), 1000, () => undefined)
    }

    expect(sent).toHaveLength(3)

    await pushes.take(OTHER_IDE, bodyFor(APPLE), 1000, () => undefined)
    expect(sent).toHaveLength(4)

    await pushes.take(IDE, bodyFor(APPLE), 61_000, () => undefined)
    expect(sent).toHaveLength(5)
  })

  it('общий предел релея держит и разных IDE', async () => {
    const { pushes, sent } = pushesWith({ total: 2 })

    for (let index = 0; index < 4; index += 1) {
      await pushes.take(Buffer.alloc(16, index), bodyFor(APPLE), 1000, () => undefined)
    }

    expect(sent).toHaveLength(2)
  })

  it('потолок звонков в пути: медленная служба не копит очередь', async () => {
    const { pushes, sent, release } = pushesWith({ inFlight: 1 })
    const first = pushes.take(IDE, bodyFor(APPLE), 0, () => undefined)

    await pushes.take(IDE, bodyFor(APPLE), 0, () => undefined)
    expect(sent).toHaveLength(1)

    release()
    await first
    await pushes.take(IDE, bodyFor(APPLE), 0, () => undefined)
    expect(sent).toHaveLength(2)
  })
})
