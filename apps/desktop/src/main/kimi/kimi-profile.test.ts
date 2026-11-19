import { rm, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { writeKimiProfile } from './kimi-profile'

describe('указания IDE для Kimi', () => {
  it('профиль заменяет встроенный `agent` и дописывает к его промпту', async () => {
    const home = await mkdtemp(join(tmpdir(), 'kimi-profile-'))

    try {
      await writeKimiProfile(home, 'Inside the IDE.')

      const text = await readFile(join(home, 'agents', 'agent.md'), 'utf8')
      const [, frontmatter = '', body = ''] = text.split('---\n')

      expect(frontmatter).toContain('name: agent\n')
      expect(frontmatter).toContain('override: true\n')
      expect(frontmatter).toMatch(/description: \S/)
      // Промпт Kimi первым, указания IDE - после него.
      expect(body.trim().split('\n\n')).toEqual(['${base_prompt}', 'Inside the IDE.'])
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
