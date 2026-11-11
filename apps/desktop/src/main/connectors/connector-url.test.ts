import { it, expect, describe } from 'vitest'

import { publicUrl, hasSecretParts, isAllowedMcpUrl } from './connector-url'

describe('isAllowedMcpUrl', () => {
  it('https - везде, http - только на своей машине', () => {
    expect(isAllowedMcpUrl('https://mcp.linear.app/mcp')).toBe(true)
    expect(isAllowedMcpUrl('http://localhost:3000/mcp')).toBe(true)
    expect(isAllowedMcpUrl('http://127.0.0.1:3000/mcp')).toBe(true)
    expect(isAllowedMcpUrl('http://[::1]:3000/mcp')).toBe(true)
    expect(isAllowedMcpUrl('http://example.com/mcp')).toBe(false)
    expect(isAllowedMcpUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedMcpUrl('x')).toBe(false)
  })
})

describe('publicUrl и hasSecretParts', () => {
  it('ключ в строке запроса и логин - секретные части', () => {
    expect(publicUrl('https://x.dev/mcp?api_key=k')).toBe('https://x.dev/mcp')
    expect(publicUrl('https://user:pass@x.dev/mcp')).toBe('https://x.dev/mcp')
    expect(hasSecretParts('https://x.dev/mcp?api_key=k')).toBe(true)
    expect(hasSecretParts('https://user:pass@x.dev/mcp')).toBe(true)
    expect(hasSecretParts('https://x.dev/mcp')).toBe(false)
    expect(hasSecretParts('https://X.dev')).toBe(false)
    expect(hasSecretParts('https://x.dev:443/mcp')).toBe(false)
  })

  it('ключ в пути - маской, и маска не меняется при повторе', () => {
    const zapier = 'https://mcp.zapier.com/api/mcp/s/a1b2c3d4e5f6g7h8i9j0k1l2m3/mcp'

    expect(publicUrl(zapier)).toBe('https://mcp.zapier.com/api/mcp/s/•••/mcp')
    expect(hasSecretParts(zapier)).toBe(true)
    expect(publicUrl(publicUrl(zapier))).toBe(publicUrl(zapier))
  })
})
