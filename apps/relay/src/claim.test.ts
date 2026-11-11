import { it, expect } from 'vitest'

import { claimInput as protocolClaimInput } from '@agentic-workstation/remote-protocol/relay-claim'

import { claimInput, CLAIM_LABEL } from './claim.ts'

/** Своя копия подписанного текста у релея - та же, что у протокола IDE и телефона. */
it('текст подписи совпадает с протоколом байт в байт', () => {
  const address = Buffer.alloc(16, 7)
  const challenge = Buffer.alloc(32, 9)

  for (const kind of ['agent', 'device'] as const) {
    expect(
      claimInput(kind, address, challenge).equals(
        Buffer.from(protocolClaimInput(kind, address.toString('base64url'), challenge)),
      ),
    ).toBe(true)
  }

  expect(CLAIM_LABEL).toBe('aw/v1/relay-claim')
})
