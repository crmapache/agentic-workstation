import { rm, mkdir, mkdtemp, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import type { ProjectImageRead } from '@shared/preview-images'

import { readImageFile } from './image-file'
import { IMAGE_FILE_MAX_BYTES } from './image-file.constants'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`

let base = ''
let root = ''

const versionOf = (read: ProjectImageRead) => (read.kind === 'image' ? read.version : null)

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'agentic-workstation-image-'))
  root = join(base, 'project')
  await mkdir(join(root, 'docs'), { recursive: true })
  await writeFile(join(root, 'docs', 'shot.png'), PNG)
  await writeFile(join(root, 'docs', 'notes.txt'), 'text')
  await writeFile(join(root, '.env'), 'SECRET=1')
  await writeFile(join(root, 'x.constructor'), 'not an image')
  await writeFile(join(base, 'secret.png'), PNG)
  await symlink(join(base, 'secret.png'), join(root, 'docs', 'escape.png'))
  await symlink(join(root, '.env'), join(root, 'docs', 'logo.png'))
  await symlink(join(root, 'docs', 'shot.png'), join(root, 'alias.png'))
  await mkdir(join(root, 'folder.png'))
  await writeFile(join(root, 'huge.png'), '')
  await truncate(join(root, 'huge.png'), IMAGE_FILE_MAX_BYTES + 1)
})

afterAll(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('readImageFile', () => {
  it('картинка проекта - data URL с типом по расширению и версией', async () => {
    const read = await readImageFile(root, 'docs/shot.png')

    expect(read).toMatchObject({ kind: 'image', data: PNG_URL, realPath: null })
    expect(versionOf(read)).toEqual(expect.any(String))
  })

  it('та же версия - unchanged, байты не пересылаются', async () => {
    const first = await readImageFile(root, 'docs/shot.png')

    expect(await readImageFile(root, 'docs/shot.png', versionOf(first))).toEqual({
      kind: 'unchanged',
    })
  })

  it('ссылка внутри проекта - картинка и её настоящий путь', async () => {
    expect(await readImageFile(root, 'alias.png')).toMatchObject({
      kind: 'image',
      data: PNG_URL,
      realPath: 'docs/shot.png',
    })
  })

  it('не картинка - ни по имени, ни по настоящему файлу, ни по имени из прототипа', async () => {
    expect(await readImageFile(root, 'docs/notes.txt')).toEqual({ kind: 'notImage' })
    expect(await readImageFile(root, 'docs/logo.png')).toEqual({ kind: 'notImage' })
    expect(await readImageFile(root, 'x.constructor')).toEqual({ kind: 'notImage' })
  })

  it('нет файла, папка с именем картинки - missing', async () => {
    expect(await readImageFile(root, 'docs/missing.png')).toEqual({ kind: 'missing' })
    expect(await readImageFile(root, 'folder.png')).toEqual({ kind: 'missing' })
  })

  it('за проект не выходит: ни путём, ни ссылкой', async () => {
    expect(await readImageFile(root, '../secret.png')).toEqual({
      kind: 'failed',
      reason: 'outside',
    })
    expect(await readImageFile(root, 'docs/escape.png')).toEqual({
      kind: 'failed',
      reason: 'outside',
    })
  })

  it('больше потолка - tooLarge с размером', async () => {
    expect(await readImageFile(root, 'huge.png')).toEqual({
      kind: 'tooLarge',
      size: IMAGE_FILE_MAX_BYTES + 1,
      limit: IMAGE_FILE_MAX_BYTES,
    })
  })
})
