import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { Conversation } from '@shared/claude'
import type { FeedItem, ToolFeedItem } from '@shared/claude-feed'

import { editRows } from './diff.utils'
import {
  editMeta,
  toolMeta,
  editAnchor,
  fileTarget,
  toolDetail,
  toolTarget,
} from './tool-summary.utils'
import { rowAtEdge, streamStatus } from './Feed/Feed.utils'
import { compactText, compactProgress } from './NoticeRow/NoticeRow.utils'
import { planSteps } from './PlanCard/PlanCard.utils'

const tool = (
  name: string,
  input: Record<string, unknown>,
  extra: Partial<ToolFeedItem> = {},
): ToolFeedItem => ({
  kind: 'tool',
  id: name,
  parentToolUseId: null,
  name,
  input,
  status: 'done',
  result: { text: '', isError: false, truncated: false },
  startedAt: 0,
  endedAt: 0,
  closedReason: null,
  ...extra,
})

/** Перевод, который отдаёт ключ и подстановки - по нему видно, что выбрано. */
const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}${JSON.stringify(values)}` : key) as unknown as TFunction

describe('шапка вызова', () => {
  it('цель - путь от корня, команда первой строкой, скилл с аргументами, иначе имя', () => {
    expect(toolTarget(tool('Read', { file_path: '/p/src/a.ts' }), '/p')).toBe('src/a.ts')
    expect(toolTarget(tool('Bash', { command: 'pnpm test\nrm -rf x' }))).toBe('pnpm test')
    expect(toolTarget(tool('Skill', { skill: 'infra', args: 'logs\nmore' }))).toBe('infra logs')
    expect(toolTarget(tool('mcp__github__list_issues', {}))).toBe('list_issues')
  })

  it('итог: строки, совпадения, вывод, причина закрытия', () => {
    const read = tool(
      'Read',
      {},
      { result: { text: '1\ta\n2\tb\n', isError: false, truncated: false } },
    )

    expect(toolMeta(read)).toEqual({ kind: 'lines', count: 2 })
    expect(toolMeta(tool('Grep', {}))).toEqual({ kind: 'matches', count: 0 })
    expect(toolMeta(tool('Write', { content: 'a\nb\nc' }))).toEqual({ kind: 'lines', count: 3 })
    expect(toolMeta(tool('Bash', {}))).toEqual({ kind: 'output', empty: true })
    expect(toolMeta(tool('Bash', {}, { status: 'interrupted', closedReason: 'stopped' }))).toEqual({
      kind: 'closed',
      reason: 'stopped',
    })
  })

  // Большую правку CLI шлёт с пустым диффом: «+0 −0» сказало бы, что ничего не изменилось.
  it('итог правки: цифры CLI, без них - по строкам диффа, большая правка - «±»', () => {
    const input = { old_string: 'a', new_string: 'b\nc' }
    const result = (extra: object) => ({ text: '', isError: false, truncated: false, ...extra })
    const meta = (extra: object) => {
      const edit = tool('Edit', input, { result: result(extra) })

      return editMeta(edit.result, editRows(edit))
    }

    expect(meta({ changeCounts: { added: 40, removed: 3 } })).toEqual({
      kind: 'diff',
      added: 40,
      removed: 3,
    })
    expect(meta({})).toEqual({ kind: 'diff', added: 2, removed: 1 })
    expect(meta({ uncounted: true })).toEqual({ kind: 'uncounted' })
  })

  it('вывод: не больше 60 строк, ✓ зелёным, ошибка красным, stderr красным', () => {
    const long = Array.from({ length: 70 }, (_, index) => `line ${index}`).join('\n')
    const bash = tool(
      'Bash',
      {},
      {
        result: {
          text: '',
          isError: false,
          truncated: false,
          stdout: '✓ ok\nplain',
          stderr: 'boom',
        },
      },
    )

    expect(
      toolDetail(tool('Read', {}, { result: { text: long, isError: false, truncated: false } })),
    ).toMatchObject({
      hidden: 10,
    })
    expect(toolDetail(bash).lines.map((line) => line.tone)).toEqual(['ok', 'dim', 'bad'])
  })

  it('путь правки ведёт на её место - самую длинную добавленную строку', () => {
    const edit = tool('Edit', {
      file_path: '/p/a.ts',
      old_string: 'x',
      new_string: '{\n  return computeTotal(items)\n}',
    })

    expect(editAnchor(edit)).toBe('return computeTotal(items)')
    expect(fileTarget(edit)).toEqual({ path: '/p/a.ts', find: 'return computeTotal(items)' })
    expect(fileTarget(tool('Grep', { path: '/p' }))).toBeNull()
  })
})

describe('строка статуса', () => {
  const conversation = (change: Partial<Conversation>) =>
    ({
      status: 'idle',
      stopRequestedAt: null,
      turnStartedAt: null,
      workStartedAt: null,
      workPausedMs: 0,
      ...change,
    }) as Conversation

  it('работа - время всего запроса, вопрос, повтор, фоновые агенты', () => {
    const retry: FeedItem = {
      kind: 'retry',
      id: 'r',
      parentToolUseId: null,
      pending: true,
      reason: 'overloaded',
      attempt: 2,
      maxRetries: 10,
      retryAt: 5_000,
      startedAt: 0,
      outcome: null,
      durationMs: 0,
    }
    const agent = tool('Agent', {}, { status: 'running' })

    expect(
      streamStatus(conversation({ status: 'running', workStartedAt: 100, workPausedMs: 7 }), []),
    ).toEqual({
      kind: 'thinking',
      startedAt: 100,
      pausedMs: 7,
    })
    expect(streamStatus(conversation({ status: 'waiting' }), [retry])).toEqual({ kind: 'waiting' })
    expect(streamStatus(conversation({ status: 'running' }), [retry])).toMatchObject({
      kind: 'retry',
    })
    expect(streamStatus(conversation({}), [agent])).toEqual({ kind: 'agents', count: 1 })
    expect(streamStatus(conversation({}), [])).toEqual({ kind: 'none' })
  })

  it('строка у кромки - первая, чей низ ниже кромки', () => {
    const bottoms = [10, 20, 30, 40]

    expect(rowAtEdge(4, (index) => bottoms[index] ?? 0, 25)).toBe(2)
    expect(rowAtEdge(4, (index) => bottoms[index] ?? 0, 0)).toBe(0)
  })
})

describe('служебные строки и план', () => {
  it('компакт: процент по часам с потолком, «до и после» с длительностью', () => {
    expect(compactProgress(0)).toBe(0)
    expect(compactProgress(10 * 60_000)).toBe(95)
    expect(
      compactText(t, {
        kind: 'compact',
        id: 'c',
        parentToolUseId: null,
        pending: false,
        startedAt: 0,
        trigger: 'manual',
        preTokens: 51_200,
        postTokens: 5_800,
        durationMs: 40_000,
      }),
    ).toContain('claudeCode.notice.compact.manually')
  })

  it('шаги плана - пункты верхнего уровня вне блоков кода', () => {
    expect(planSteps('1. Read\n   - detail\n2. Edit\n```\n- not a step\n```\n- Test')).toBe(3)
  })
})
