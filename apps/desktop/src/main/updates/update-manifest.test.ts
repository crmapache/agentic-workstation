import { it, expect, describe } from 'vitest'

import { parseUpdateManifest, isAllowedDownloadUrl } from './update-manifest'

const validManifest = {
  version: '0.2.0',
  notes: 'Новое',
  releasedAt: '2026-10-15T12:00:00.000Z',
  assets: {
    'mac-arm64': {
      url: 'https://github.com/o/r/releases/download/v0.2.0/agentic-workstation-mac-arm64.zip',
      sha512: 'abc==',
      size: 1024,
    },
  },
}

describe('parseUpdateManifest', () => {
  it('разбирает правильный манифест', () => {
    expect(parseUpdateManifest(validManifest)).toEqual(validManifest)
  })

  it('без notes и releasedAt - пустые строки', () => {
    const { notes, releasedAt, ...rest } = validManifest

    expect(parseUpdateManifest(rest)).toMatchObject({ notes: '', releasedAt: '' })
  })

  it('отклоняет версию не по semver', () => {
    expect(() => parseUpdateManifest({ ...validManifest, version: 'latest' })).toThrow('semver')
  })

  it('отклоняет сборку без sha512, с плохим размером или адресом', () => {
    const withAsset = (asset: object) => ({ ...validManifest, assets: { 'mac-arm64': asset } })
    const asset = validManifest.assets['mac-arm64']

    expect(() => parseUpdateManifest(withAsset({ ...asset, sha512: '' }))).toThrow('sha512')
    expect(() => parseUpdateManifest(withAsset({ ...asset, size: -1 }))).toThrow('размер')
    expect(() => parseUpdateManifest(withAsset({ ...asset, url: 'ftp://x/y.zip' }))).toThrow(
      'адрес',
    )
  })
})

describe('isAllowedDownloadUrl', () => {
  it('https - да, http - только на свою машину', () => {
    expect(isAllowedDownloadUrl('https://github.com/a.zip')).toBe(true)
    expect(isAllowedDownloadUrl('http://127.0.0.1:5399/a.zip')).toBe(true)
    expect(isAllowedDownloadUrl('http://localhost/a.zip')).toBe(true)
    expect(isAllowedDownloadUrl('http://example.com/a.zip')).toBe(false)
    expect(isAllowedDownloadUrl('file:///tmp/a.zip')).toBe(false)
    expect(isAllowedDownloadUrl('not a url')).toBe(false)
  })
})
