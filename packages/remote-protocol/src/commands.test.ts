import { it, expect, describe } from 'vitest'

import {
  parseCommand,
  COMMAND_NAMES,
  REFUSED_COMMANDS,
  COMMAND_PATIENCE_MS,
  MAY_ARRIVE_IN_PARTS,
} from './commands'

const CONVERSATION = '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f'

const PROJECT = `p-${'A'.repeat(22)}`

const ok = (name: string, args: object) => parseCommand(name, args).ok

describe('команды телефона уровня ACC', () => {
  it('запрещённое не попадает в белый список ни одним именем', () => {
    for (const name of REFUSED_COMMANDS) expect(COMMAND_NAMES).not.toContain(name)
  })

  it('очередь разговора: отложить с фото частями, убрать и отправить сейчас - по id из IDE', () => {
    const queued = { conversationId: CONVERSATION, queuedId: CONVERSATION }

    expect(ok('conversation.enqueue', { conversationId: CONVERSATION, text: 'later' })).toBe(true)
    expect(MAY_ARRIVE_IN_PARTS.has('conversation.enqueue')).toBe(true)
    expect(ok('conversation.unqueue', queued)).toBe(true)
    expect(ok('conversation.sendQueued', queued)).toBe(true)
    expect(ok('conversation.unqueue', { ...queued, queuedId: '../q' })).toBe(false)
  })

  it('остановки: вопрос закрыть, процесс погасить, задачу - по имени CLI без разделителей', () => {
    expect(ok('conversation.dismiss', { conversationId: CONVERSATION, requestId: 'r1' })).toBe(true)
    expect(ok('conversation.forceStop', { conversationId: CONVERSATION })).toBe(true)
    expect(ok('conversation.stopTask', { conversationId: CONVERSATION, taskId: 'task_a1' })).toBe(
      true,
    )
    expect(ok('conversation.stopTask', { conversationId: CONVERSATION, taskId: 'a/../b' })).toBe(
      false,
    )
    expect(ok('conversation.cancelCarryOn', { conversationId: CONVERSATION })).toBe(true)
  })

  it('быстрый режим - флагом, вопрос сбоку - со своим id и непустым вопросом', () => {
    expect(ok('conversation.setFast', { conversationId: CONVERSATION, fast: true })).toBe(true)
    expect(ok('conversation.setFast', { conversationId: CONVERSATION, fast: 'yes' })).toBe(false)
    expect(
      ok('conversation.aside', { conversationId: CONVERSATION, askId: 'a1', question: 'why?' }),
    ).toBe(true)
    expect(
      ok('conversation.aside', { conversationId: CONVERSATION, askId: 'a1', question: '   ' }),
    ).toBe(false)
    expect(ok('conversation.asideCancel', { conversationId: CONVERSATION, askId: 'a/1' })).toBe(
      false,
    )
  })

  it('откат - к сообщению по UUID и только тремя областями', () => {
    const rewind = (messageId: string, scope: string) =>
      ok('conversation.rewind', { conversationId: CONVERSATION, messageId, scope })

    expect(rewind(CONVERSATION, 'both')).toBe(true)
    expect(rewind(CONVERSATION, 'files')).toBe(false)
    expect(rewind('a1:0', 'conversation')).toBe(false)
    expect(
      ok('conversation.rewindPreview', { conversationId: CONVERSATION, messageId: CONVERSATION }),
    ).toBe(true)
  })

  it('поиск: набранный и описанный - непустой запрос, отмена по id прогона', () => {
    expect(ok('conversation.search', { projectKey: PROJECT, query: 'login' })).toBe(true)
    expect(ok('conversation.search', { projectKey: PROJECT, query: ' ' })).toBe(false)
    expect(
      ok('conversation.searchAi', { projectKey: PROJECT, runId: 'r1', query: 'the auth bug' }),
    ).toBe(true)
    expect(ok('conversation.searchCancel', { runId: 'r1' })).toBe(true)
  })

  it('аккаунты: обычный вход - пустой id, забыть - только добавленный', () => {
    expect(ok('accounts.list', {})).toBe(true)
    expect(ok('accounts.use', { accountId: '' })).toBe(true)
    expect(ok('accounts.use', { accountId: '0123456789abcdef' })).toBe(true)
    expect(ok('accounts.use', { accountId: 'someone@mail' })).toBe(false)
    expect(ok('accounts.forget', { accountId: '' })).toBe(false)
    expect(ok('accounts.rename', { accountId: '', alias: 'Work' })).toBe(true)
    expect(ok('connectors.reconnect', { connectorId: CONVERSATION })).toBe(true)
    expect(ok('projects.open', { projectKey: PROJECT })).toBe(true)
  })

  it('сценарии: час в пределах суток, ритм из списка, очередь чистится, но не закрывается', () => {
    const hour = {
      projectKey: PROJECT,
      scenarioId: 'tidy',
      scope: 'project',
      scheduleId: '',
      at: 9 * 60,
      repeat: 'weekly',
      weekday: 1,
      inputs: {},
      worktree: true,
      provider: 'claude',
    }

    expect(ok('scenarios.schedule', hour)).toBe(true)
    expect(ok('scenarios.schedule', { ...hour, at: 24 * 60 })).toBe(false)
    expect(ok('scenarios.schedule', { ...hour, repeat: 'hourly' })).toBe(false)
    expect(ok('scenarios.schedule', { ...hour, weekday: 0 })).toBe(false)
    expect(ok('scenarios.queue', { queueId: 'q1', action: { kind: 'clear' } })).toBe(true)
    expect(ok('scenarios.queue', { queueId: 'q1', action: { kind: 'close' } })).toBe(false)
    expect(ok('scenarios.log', { projectKey: PROJECT, runId: 'r1', key: 'head' })).toBe(true)
    expect(
      ok('scenarios.draft', {
        projectKey: PROJECT,
        draftId: 'd1',
        description: 'Tidy the repo',
        scope: 'user',
      }),
    ).toBe(true)
    expect(ok('scenarios.saveDraft', { projectKey: PROJECT, draftId: 'd1' })).toBe(true)
    expect(ok('scenarios.save', {})).toBe(false)
  })

  it('долгие команды ждут дольше обычного, и только названные', () => {
    for (const [name, ms] of Object.entries(COMMAND_PATIENCE_MS)) {
      expect(COMMAND_NAMES).toContain(name)
      expect(ms).toBeGreaterThan(60_000)
    }
  })
})
