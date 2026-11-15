import { it, expect, describe } from 'vitest'

import { parseLinkList, linkCandidates } from './git-worktree-links'

describe('parseLinkList', () => {
  it('путь на строку: комментарии и пустые строки мимо, слэши к одному виду', () => {
    const text = [
      '# журнал решений',
      'stages-adr/',
      '',
      '  .claude\\hooks\\local.sh  ',
      './notes//draft.md',
    ].join('\r\n')

    expect(parseLinkList(text)).toEqual(['stages-adr', '.claude/hooks/local.sh', 'notes/draft.md'])
  })

  it('путь наружу, абсолютный и в .git - не берём', () => {
    const text = ['../secret', 'a/../../b', '/etc/hosts', 'C:/x', '.git/config', '.', 'ok'].join(
      '\n',
    )

    expect(parseLinkList(text)).toEqual(['ok'])
  })
})

describe('linkCandidates', () => {
  it('проект в корне: локальные файлы Claude Code, потом список, без повторов', () => {
    expect(linkCandidates('', ['stages-adr', 'CLAUDE.local.md'])).toEqual([
      '.claude/settings.local.json',
      'CLAUDE.local.md',
      'stages-adr',
    ])
  })

  it('путь внутри другого пути набора отброшен: папка, связанная целиком, уже несёт его', () => {
    expect(linkCandidates('', ['journal', 'journal/a.md', 'journalist.md', '.claude'])).toEqual([
      'CLAUDE.local.md',
      'journal',
      'journalist.md',
      '.claude',
    ])
  })

  it('проект в подпапке: CLAUDE.local.md в каждой папке до корня, настройки - в проекте', () => {
    expect(linkCandidates('packages/app/', [])).toEqual([
      'packages/app/.claude/settings.local.json',
      'packages/app/CLAUDE.local.md',
      'packages/CLAUDE.local.md',
      'CLAUDE.local.md',
    ])
  })
})
