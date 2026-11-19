import { mkdir, access, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { EXTENSION_ID, MANIFEST_FILE } from '../manifest/manifest'
import AGENTS_GUIDE from './templates/AGENTS.md.txt?raw'
import CLAUDE_GUIDE from './templates/CLAUDE.md.txt?raw'
import IDE_TYPES from './templates/ide.d.ts.txt?raw'
import STARTER from './templates/main.js.txt?raw'

/**
 * id новой папки из имени: латиница, цифры и дефисы, с буквы; занято - с номером на конце.
 * Пусто после чистки (имя кириллицей) - «extension».
 */
export const extensionIdFor = (name: string, taken: (id: string) => boolean): string => {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^[^a-z]+/, '')
      .replace(/-+$/, '')
      .slice(0, 34)
      .replace(/-+$/, '') || 'extension'
  const id = base.length >= 2 ? base : `${base}-extension`

  if (!taken(id)) return id

  for (let index = 2; ; index += 1) {
    const candidate = `${id}-${index}`

    if (!taken(candidate) && EXTENSION_ID.test(candidate)) return candidate
  }
}

/** Файлы, которые ИИ читает перед работой: руководство и описание API. Обновляются всегда. */
export const writeGuides = async (dir: string): Promise<void> => {
  await writeFile(join(dir, 'AGENTS.md'), AGENTS_GUIDE)
  await writeFile(join(dir, 'CLAUDE.md'), CLAUDE_GUIDE)
  await writeFile(join(dir, 'ide.d.ts'), IDE_TYPES)
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  )

/**
 * Заготовка расширения (ADR 0091): манифест без прав, рабочий main.js, README и руководство для
 * ИИ. Без прав заготовка сразу запускается - человек видит, что всё живо, ещё до работы ИИ.
 */
export const scaffoldExtension = async (
  root: string,
  id: string,
  draft: { name: string; description: string },
): Promise<string> => {
  const dir = join(root, id)

  await mkdir(dir, { recursive: true })
  await writeGuides(dir)

  if (!(await exists(join(dir, MANIFEST_FILE)))) {
    const manifest = {
      id,
      name: draft.name,
      version: '0.1.0',
      description: draft.description,
      icon: 'Puzzle',
      main: 'main.js',
      apiVersion: 1,
      permissions: [],
      settings: [],
    }

    await writeFile(join(dir, 'main.js'), STARTER)
    await writeFile(join(dir, 'README.md'), `# ${draft.name}\n\n${draft.description}\n`)
    await writeFile(join(dir, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`)
  }

  return dir
}
