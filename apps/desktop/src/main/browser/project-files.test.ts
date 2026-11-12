import { rm, mkdir, mkdtemp, symlink, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { realPathInside } from './project-files'

describe('файл внутри папки разговора', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'aw-files-')))
    await mkdir(join(dir, 'project/docs'), { recursive: true })
    await mkdir(join(dir, 'secrets'))
    await writeFile(join(dir, 'project/docs/cv.pdf'), 'x')
    await writeFile(join(dir, 'secrets/id_ed25519'), 'key')
    await mkdir(join(dir, 'project-other'))
    await writeFile(join(dir, 'project-other/notes.txt'), 'x')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('файл проекта - его настоящий путь', async () => {
    expect(await realPathInside(join(dir, 'project'), join(dir, 'project/docs/cv.pdf'))).toBe(
      join(dir, 'project/docs/cv.pdf'),
    )
  })

  it('выход наружу строкой пути и ссылкой из проекта - отказ', async () => {
    await symlink(join(dir, 'secrets/id_ed25519'), join(dir, 'project/docs/key'))
    await symlink(join(dir, 'secrets'), join(dir, 'project/linked'))

    const root = join(dir, 'project')

    expect(await realPathInside(root, join(root, '../secrets/id_ed25519'))).toBeNull()
    expect(await realPathInside(root, join(root, 'docs/key'))).toBeNull()
    expect(await realPathInside(root, join(root, 'linked/id_ed25519'))).toBeNull()
    // Соседняя папка с тем же началом имени - не внутри.
    expect(await realPathInside(root, join(dir, 'project-other/notes.txt'))).toBeNull()
  })

  it('файла нет - отказ, а не догадка', async () => {
    expect(await realPathInside(join(dir, 'project'), join(dir, 'project/none.txt'))).toBeNull()
  })
})
