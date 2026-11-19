import { it, expect, describe } from 'vitest'

import { choiceOf, policyFor, workspaceFromConfig } from './codex-modes'

const DEFAULT_MODEL = {
  value: 'gpt-6.1',
  displayName: 'GPT-6.1',
  description: '',
  defaultEffort: 'medium' as const,
  isDefault: true,
}

describe('режим и выбор хода Codex', () => {
  it('«по умолчанию» едет явно: настройки Codex, без них - модель каталога и её уровень', () => {
    const catalog = (id: string | null) =>
      id === null || id === 'gpt-6.1'
        ? DEFAULT_MODEL
        : { ...DEFAULT_MODEL, value: id, isDefault: false, efforts: ['low' as const] }
    const none = { model: null, effort: null }

    expect(choiceOf(none, none, catalog)).toEqual({ model: 'gpt-6.1', effort: 'medium' })
    expect(choiceOf(none, { model: 'gpt-6.1-mini', effort: 'low' }, catalog)).toEqual({
      model: 'gpt-6.1-mini',
      effort: 'low',
    })
    // Уровень из настроек, которого выбранная модель не знает, - её собственный.
    expect(
      choiceOf({ model: 'gpt-6.1-mini', effort: null }, { model: null, effort: 'high' }, catalog),
    ).toEqual({
      model: 'gpt-6.1-mini',
      effort: 'medium',
    })
    expect(choiceOf({ model: 'x', effort: 'high' }, none, () => null)).toEqual({
      model: 'x',
      effort: 'high',
    })
    expect(choiceOf(none, none, () => null)).toEqual(none)
  })

  it('запись в папке проекта - со своими папками и сетью человека, чтение и план - без сети', () => {
    const workspace = workspaceFromConfig({
      config: {
        sandbox_workspace_write: { writable_roots: ['/extra', ''], network_access: true },
      },
    })

    expect(workspace).toEqual({
      writableRoots: ['/extra'],
      networkAccess: true,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    })
    expect(policyFor('acceptEdits', workspace).sandboxPolicy).toEqual({
      type: 'workspaceWrite',
      ...workspace,
    })
    expect(policyFor('default', workspace).sandboxPolicy).toMatchObject({ networkAccess: true })
    expect(policyFor('plan', workspace).sandboxPolicy).toEqual({
      type: 'readOnly',
      networkAccess: false,
    })
    expect(policyFor('acceptEdits').sandboxPolicy).toMatchObject({
      writableRoots: [],
      networkAccess: false,
    })
    expect(workspaceFromConfig(null).networkAccess).toBe(false)
  })

  it('«Авто» - без вопросов в папке проекта, «Спрашивать» - на всё неизвестное', () => {
    expect(policyFor('acceptEdits')).toMatchObject({
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
    })
    expect(policyFor('default').approvalPolicy).toBe('untrusted')
    expect(policyFor('plan')).toMatchObject({ sandbox: 'read-only', plan: true })
    expect(policyFor('readOnly')).toMatchObject({
      approvalPolicy: 'on-request',
      sandbox: 'read-only',
      plan: false,
    })
  })
})
