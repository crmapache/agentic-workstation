import { createHash } from 'node:crypto'

import { it, expect, describe } from 'vitest'

import { EXTENSION_ID, EXTENSION_PUBLIC_KEY, extensionIdFromDigest } from './extension-id'

describe('id расширения', () => {
  it('совпадает с открытым ключом манифеста', () => {
    const digest = createHash('sha256')
      .update(Buffer.from(EXTENSION_PUBLIC_KEY, 'base64'))
      .digest('hex')

    expect(extensionIdFromDigest(digest)).toBe(EXTENSION_ID)
  })

  it('переводит цифры в буквы a-p', () => {
    expect(extensionIdFromDigest('0123456789abcdef'.repeat(2))).toBe('abcdefghijklmnop'.repeat(2))
  })
})
