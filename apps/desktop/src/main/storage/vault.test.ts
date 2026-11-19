import { rm, stat, mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { Vault } from './vault'
import type { VaultCipher } from './vault'

/** Подставной шифр: переворачивает байты - на диске не должно быть открытого текста. */
const reversing = (available = true): VaultCipher => ({
  available: () => available,
  encrypt: (text) => Buffer.from(text, 'utf8').reverse(),
  decrypt: (data) => Buffer.from(data).reverse().toString('utf8'),
})

describe('Vault', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'vault-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('пишет зашифрованно, с правами 600, и читает обратно', async () => {
    const path = join(dir, 'vault.bin')
    const vault = await Vault.load(path, reversing())

    await vault.set('connector:a', '{"token":"secret-value"}')

    const raw = await readFile(path, 'utf8')
    const mode = (await stat(path)).mode & 0o777

    expect(raw).not.toContain('secret-value')
    expect(mode).toBe(0o600)
    expect((await Vault.load(path, reversing())).get('connector:a')).toBe(
      '{"token":"secret-value"}',
    )
  })

  it('удаляет ключи по началу', async () => {
    const path = join(dir, 'vault.bin')
    const vault = await Vault.load(path, reversing())

    await vault.set('connector:a', '1')
    await vault.set('connector:b', '2')
    await vault.forgetPrefix('connector:a')

    const reloaded = await Vault.load(path, reversing())

    expect(reloaded.get('connector:a')).toBeNull()
    expect(reloaded.get('connector:b')).toBe('2')
  })

  it('без шифрования ничего не пишет', async () => {
    const vault = await Vault.load(join(dir, 'vault.bin'), reversing(false))

    expect(vault.available).toBe(false)
    await expect(vault.set('k', 'v')).rejects.toThrow()
    await expect(stat(join(dir, 'vault.bin'))).rejects.toThrow()
  })

  it('нечитаемый файл откладывается рядом, а не затирается', async () => {
    const path = join(dir, 'vault.bin')
    const broken: VaultCipher = { ...reversing(), decrypt: () => 'not json' }

    await (await Vault.load(path, reversing())).set('connector:a', 'old')

    const vault = await Vault.load(path, broken)

    expect(vault.wasReset).toBe(true)
    expect(vault.get('connector:a')).toBeNull()
    expect((await readdir(dir)).some((name) => name.startsWith('vault.bin.unreadable-'))).toBe(true)
  })
})
