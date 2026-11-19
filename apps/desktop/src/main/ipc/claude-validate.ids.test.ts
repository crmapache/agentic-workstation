import { it, expect, describe } from 'vitest'

import { assertMessageId, assertAgentSessionId } from './claude-validate'

describe('id сообщений и сессий провайдеров', () => {
  it('UUID и форматы OpenCode проходят, путь и мусор - нет', () => {
    expect(assertMessageId('3f2b6c1e-8a4d-4f5e-9b7a-1c2d3e4f5a6b')).toBe(
      '3f2b6c1e-8a4d-4f5e-9b7a-1c2d3e4f5a6b',
    )
    expect(assertMessageId('msg_1f09bdd0e0014DTo8IPPH7CAyT_4')).toBe(
      'msg_1f09bdd0e0014DTo8IPPH7CAyT_4',
    )
    expect(assertAgentSessionId('ses_e0f8dadfdffeBvTVMwILtOxbFT')).toBe(
      'ses_e0f8dadfdffeBvTVMwILtOxbFT',
    )
    expect(() => assertMessageId('msg_../../etc')).toThrow()
    expect(() => assertMessageId('ses_abc')).not.toThrow()
    expect(() => assertAgentSessionId('ses_a/b')).toThrow()
    expect(() => assertAgentSessionId(42)).toThrow()
  })
})
