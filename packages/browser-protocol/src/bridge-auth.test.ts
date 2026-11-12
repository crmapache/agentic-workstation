import { it, expect, describe } from 'vitest'

import { proofOf, newNonce, sameProof, newBridgeKey } from './bridge-auth'

describe('взаимная проверка IDE и host', () => {
  it('доказательство сходится только с тем же ключом, стороной и числом', async () => {
    const key = newBridgeKey()
    const nonce = newNonce()
    const proof = await proofOf(key, 'host', nonce)

    expect(proof).toMatch(/^[0-9a-f]{64}$/)
    expect(sameProof(proof, await proofOf(key, 'host', nonce))).toBe(true)
    expect(sameProof(proof, await proofOf(newBridgeKey(), 'host', nonce))).toBe(false)
    expect(sameProof(proof, await proofOf(key, 'hub', nonce))).toBe(false)
    expect(sameProof(proof, await proofOf(key, 'host', newNonce()))).toBe(false)
    expect(sameProof(proof, 'short')).toBe(false)
  })
})
