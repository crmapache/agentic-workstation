import { sign, generateKeyPairSync } from 'node:crypto'

import { it, expect, describe } from 'vitest'

import { parseUpdateManifest } from './update-manifest'
import { signedText, installerWatch, isSignedInstaller } from './win-update'

const keys = generateKeyPairSync('ed25519')
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const sha512 = 'c2hhNTEyIG9mIHRoZSBpbnN0YWxsZXI='
const asset = { url: 'https://x/y.exe', sha512, size: 10 }
const signed = (version: string, key = keys.privateKey) =>
  sign(null, Buffer.from(signedText(version, asset)), key).toString('base64')

describe('установщик обновления Windows (ADR 0048)', () => {
  it('подписанный ключом выпуска вместе с этой версией - годен', () => {
    expect(isSignedInstaller({ ...asset, signature: signed('1.2.3') }, '1.2.3', publicKey)).toBe(
      true,
    )
  })

  it('старый подписанный установщик под номером новой версии - нет: откатиться нельзя', () => {
    expect(isSignedInstaller({ ...asset, signature: signed('1.0.0') }, '9.9.9', publicKey)).toBe(
      false,
    )
  })

  it('без подписи, чужим ключом, с другой суммой или размером - нет', () => {
    const other = generateKeyPairSync('ed25519').privateKey
    const signature = signed('1.2.3')

    expect(isSignedInstaller(asset, '1.2.3', publicKey)).toBe(false)
    expect(
      isSignedInstaller({ ...asset, signature: signed('1.2.3', other) }, '1.2.3', publicKey),
    ).toBe(false)
    expect(isSignedInstaller({ ...asset, size: 11, signature }, '1.2.3', publicKey)).toBe(false)
    expect(isSignedInstaller({ ...asset, sha512: 'b3RoZXI=', signature }, '1.2.3', publicKey)).toBe(
      false,
    )
    expect(isSignedInstaller({ ...asset, signature: '!!!' }, '1.2.3', publicKey)).toBe(false)
  })

  it('манифест несёт подпись сборки, а у сборки мака её нет', () => {
    const manifest = parseUpdateManifest({
      version: '1.2.3',
      assets: {
        'mac-arm64': { url: 'https://x/m.zip', sha512, size: 5 },
        'win-x64': { url: 'https://x/w.exe', sha512, size: 5, signature: 'c2ln' },
      },
    })

    expect(manifest.assets['win-x64']?.signature).toBe('c2ln')
    expect(manifest.assets['mac-arm64']).not.toHaveProperty('signature')
  })

  it('сторож ждёт выхода IDE и только потом тихо запускает установщик', () => {
    const script = installerWatch("C:\\Users\\O'Neil\\Temp\\setup.exe", 4242, 60_000)

    expect(script).toContain('Get-Process -Id 4242')
    expect(script).toContain('WaitForExit(60000)')
    expect(script).toContain("-LiteralPath 'C:\\Users\\O''Neil\\Temp\\setup.exe'")
    expect(script).toContain("-ArgumentList '/S','--updated','--force-run'")
    expect(script.indexOf('WaitForExit')).toBeLessThan(script.indexOf('Start-Process'))
  })
})
