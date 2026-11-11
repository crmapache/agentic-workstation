import { it, expect, describe } from 'vitest'

import { classifyTool, isToolEnabled } from './tool-access'

describe('classifyTool', () => {
  it('чтение по глаголу в начале имени', () => {
    expect(classifyTool('notion-search')).toBe('read')
    expect(classifyTool('notion-get-comments')).toBe('read')
    expect(classifyTool('slack_read_channel')).toBe('read')
    expect(classifyTool('listIssues')).toBe('read')
  })

  it('пометка MCP «только чтение» - чтение', () => {
    expect(classifyTool('notion-fetch', { readOnlyHint: true })).toBe('read')
    expect(classifyTool('whatever', { readOnlyHint: true })).toBe('read')
  })

  it('отправка людям - outbound', () => {
    expect(classifyTool('slack_send_message')).toBe('outbound')
    expect(classifyTool('slack_schedule_message')).toBe('outbound')
    expect(classifyTool('slack_send_message_draft')).toBe('outbound')
    expect(classifyTool('add_reaction')).toBe('outbound')
    expect(classifyTool('notion-create-comment')).toBe('outbound')
    expect(classifyTool('slack_create_canvas')).toBe('outbound')
    expect(classifyTool('create_channel')).toBe('outbound')
    expect(classifyTool('respondToEvent')).toBe('outbound')
  })

  it('Todoist и Jira: комментарий и назначение человеку - отправка, правка задачи - запись', () => {
    expect(classifyTool('add-comments')).toBe('outbound')
    expect(classifyTool('manage-assignments')).toBe('outbound')
    expect(classifyTool('addCommentToJiraIssue')).toBe('outbound')
    expect(classifyTool('update-tasks')).toBe('write')
    expect(classifyTool('transitionJiraIssue')).toBe('write')
    expect(classifyTool('getJiraIssue')).toBe('read')
  })

  it('остальное - запись', () => {
    expect(classifyTool('notion-create-pages')).toBe('write')
    expect(classifyTool('notion-update-page')).toBe('write')
    expect(classifyTool('create_issue')).toBe('write')
  })
})

describe('isToolEnabled', () => {
  it('без выбора человека отправка выключена, остальное включено', () => {
    expect(isToolEnabled('read', undefined)).toBe(true)
    expect(isToolEnabled('write', undefined)).toBe(true)
    expect(isToolEnabled('outbound', undefined)).toBe(false)
  })

  it('выбор человека главнее', () => {
    expect(isToolEnabled('outbound', true)).toBe(true)
    expect(isToolEnabled('read', false)).toBe(false)
  })
})
