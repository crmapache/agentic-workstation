import { it, expect, describe } from 'vitest'

import {
  exitCodeOf,
  parseLines,
  localNameOf,
  repositoryName,
  summarizeGitError,
  parseRemoteBranches,
} from './git-output'

describe('parseLines и parseRemoteBranches', () => {
  it('строки без пустых', () => {
    expect(parseLines('main\nfeature/tabs\n\n')).toEqual(['main', 'feature/tabs'])
    expect(parseLines('')).toEqual([])
  })

  it('удалённые ветки без origin/HEAD', () => {
    expect(parseRemoteBranches('origin\norigin/HEAD\norigin/main\nupstream/dev\n')).toEqual([
      'origin/main',
      'upstream/dev',
    ])
  })
})

describe('summarizeGitError', () => {
  it('первые строки без пустых и без хвостовых пробелов', () => {
    const stderr = [
      'error: Your local changes to the following files would be overwritten by checkout:  ',
      '\tsrc/a.ts',
      '',
      'Aborting',
    ].join('\n')

    expect(summarizeGitError(stderr)).toBe(
      [
        'error: Your local changes to the following files would be overwritten by checkout:',
        '\tsrc/a.ts',
        'Aborting',
      ].join('\n'),
    )
  })

  it('длинный ответ обрезается', () => {
    const stderr = Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n')

    expect(summarizeGitError(stderr).split('\n')).toHaveLength(8)
  })
})

describe('repositoryName', () => {
  it('имя папки как у git clone', () => {
    expect(repositoryName('git@github.com:crmapache/agentic-workstation.git')).toBe(
      'agentic-workstation',
    )
    expect(repositoryName('https://github.com/crmapache/agentic-workstation/')).toBe(
      'agentic-workstation',
    )
    expect(repositoryName('/Users/max/repos/local')).toBe('local')
  })

  it('пусто или «..» - не адрес', () => {
    expect(repositoryName('')).toBeNull()
    expect(repositoryName('..')).toBeNull()
  })
})

describe('localNameOf и exitCodeOf', () => {
  it('удалённая ветка → локальное имя', () => {
    expect(localNameOf('origin/feature/x')).toBe('feature/x')
  })

  it('код выхода - число, нет программы - null', () => {
    expect(exitCodeOf({ code: 128 })).toBe(128)
    expect(exitCodeOf({ code: 'ENOENT' })).toBeNull()
  })
})
