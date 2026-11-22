import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

/**
 * Пакеты рабочего пространства (`@agentic-workstation/*`) отдают исходники TypeScript
 * (`exports: ./src/*.ts`). Сборщик главного процесса не вшивает рабочие зависимости, а грузит их
 * из node_modules собранного приложения - такой пакет там не загрузится, и IDE падает при
 * запуске окном ошибки. Поэтому они - только в devDependencies: тогда сборка их вшивает.
 */
describe('зависимости собранной IDE', () => {
  it('не тянут пакеты рабочего пространства в рабочие зависимости', () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> }

    expect(
      Object.keys(manifest.dependencies ?? {}).filter((name) =>
        name.startsWith('@agentic-workstation/'),
      ),
    ).toEqual([])
  })
})
