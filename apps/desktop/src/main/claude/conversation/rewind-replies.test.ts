import { it, expect, describe } from 'vitest'

import { REWIND_FILES_LISTED } from '@shared/rewind'

import { CliReplyError, CliExitedError } from '../cli/cli-process'
import {
  codeOf,
  cutDetail,
  refusalOf,
  codeDetail,
  restoredOf,
  codeOfError,
  waitsOnUnread,
  refusalOfError,
  relativePreview,
} from './rewind-replies'

describe('отказ обрезки словами панели', () => {
  it('несколько причин CLI - одна причина для человека', () => {
    expect(refusalOf('turn_running')).toBe('busy')
    expect(refusalOf('commands_queued')).toBe('busy')
    expect(refusalOf('target_not_found')).toBe('gone')
    expect(refusalOf('unseen_later_turn')).toBe('moved')
    expect(refusalOf('target_splits_tool_call')).toBe('midCall')
    expect(refusalOf('persist_failed')).toBe('notSaved')
    expect(refusalOf('something_new')).toBe('other')
  })

  it('ушедший процесс - ended, незнакомый запрос - unsupported', () => {
    expect(refusalOfError(new CliExitedError())).toEqual({ refusal: 'ended', detail: '' })
    expect(refusalOfError(new CliReplyError('Unknown subtype: rewind_files')).refusal).toBe(
      'unsupported',
    )
    expect(refusalOfError(new CliReplyError('disk full'))).toEqual({
      refusal: 'other',
      detail: 'disk full',
    })
  })

  it('непрочитанное в ходе - повод остановить ход и спросить снова', () => {
    expect(waitsOnUnread('commands_queued')).toBe(true)
    expect(waitsOnUnread('prompt_pending')).toBe(true)
    expect(waitsOnUnread('turn_running')).toBe(false)
  })

  it('подробность - слова CLI, а без них его код', () => {
    expect(cutDetail({ reason: 'stale_target', error: 'Newer message' })).toBe('Newer message')
    expect(cutDetail({ reason: 'stale_target' })).toBe('stale_target')
  })
})

describe('предпросмотр отката кода', () => {
  it('файлы и строки', () => {
    expect(
      codeOf({ canRewind: true, filesChanged: ['/p/a.ts', ' '], insertions: 3, deletions: 1 }),
    ).toEqual({ state: 'ready', files: ['/p/a.ts'], count: 1, insertions: 3, deletions: 1 })
  })

  it('ничего не правилось', () => {
    expect(codeOf({ canRewind: true, filesChanged: [] })).toEqual({ state: 'none' })
  })

  it('отказы CLI - состояниями', () => {
    expect(codeOf({ canRewind: false, error: 'File rewinding is not enabled.' })).toEqual({
      state: 'notTracked',
    })
    expect(codeOf({ canRewind: false, error: 'No file checkpoint found for message' })).toEqual({
      state: 'noCheckpoint',
    })
    expect(codeOf({ canRewind: false, error: 'boom' })).toEqual({
      state: 'unavailable',
      detail: 'boom',
    })
    expect(codeOfError('unsupported', 'Unknown subtype')).toEqual({ state: 'notTracked' })
    expect(codeOfError('ended', '')).toEqual({ state: 'unavailable', detail: '' })
  })

  it('подробность отказа code - имя состояния или слова CLI', () => {
    expect(codeDetail({ state: 'noCheckpoint' })).toBe('noCheckpoint')
    expect(codeDetail({ state: 'unavailable', detail: 'boom' })).toBe('boom')
  })

  it('возврат файлов: null - вернулись', () => {
    expect(restoredOf({ canRewind: true })).toBeNull()
    expect(restoredOf({ canRewind: false, error: 'locked' })).toBe('locked')
    expect(restoredOf({})).toBe('not restored')
  })

  it('пути - от корня проекта, вне его - от «~», список не длиннее предела', () => {
    const many = Array.from({ length: REWIND_FILES_LISTED + 5 }, (_, index) => `/p/f${index}.ts`)
    const preview = relativePreview(
      {
        state: 'ready',
        files: ['/p/src/a.ts', '/home/me/.claude/memory/x.md', '/etc/hosts', '/pp/b.ts'],
        count: 4,
        insertions: 1,
        deletions: 0,
      },
      '/p/',
      '/home/me',
    )

    expect(preview).toMatchObject({
      files: ['src/a.ts', '~/.claude/memory/x.md', '/etc/hosts', '/pp/b.ts'],
      count: 4,
    })

    const long = relativePreview(
      { state: 'ready', files: many, count: many.length, insertions: 0, deletions: 0 },
      '/p',
      '/home/me',
    )

    expect(long).toMatchObject({ count: REWIND_FILES_LISTED + 5 })
    expect(long.state === 'ready' && long.files).toHaveLength(REWIND_FILES_LISTED)
  })
})
