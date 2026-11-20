import { realpathSync } from 'node:fs'
import { sep, relative, normalize, isAbsolute } from 'node:path'

import type { DefinitionAnswer } from '@shared/definitions'

import type { DefinitionAsk } from './definition-link'
import type { JobAnswer, DefinitionJob } from './definition.types'

const NONE: JobAnswer = { kind: 'none' }

/** Путь от корня через «/», если файл в проекте; null - он за проектом. */
const insideRoot = (rootPath: string, file: string): string | null => {
  const fromRoot = relative(rootPath, file)
  const isOutside =
    fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)

  return isOutside ? null : fromRoot.split(sep).join('/')
}

/**
 * «Где определено» для редактора (ADR 0061): вопрос - процессу определений, ответ - путём, каким
 * его открывает вкладка: от корня проекта, а за проектом - абсолютным. При сбое ссылки нет,
 * а состояние процесса и ошибка показываются кнопкой экономии памяти.
 */
export class DefinitionService {
  /** Настоящий путь корня: TypeScript отдаёт пути через ссылки раскрытыми (/tmp → /private/tmp). */
  private readonly realRoots = new Map<string, string>()

  constructor(private readonly ask: DefinitionAsk) {}

  async find(
    rootPath: string,
    file: string,
    question: Omit<DefinitionJob, 'file'>,
  ): Promise<DefinitionAnswer> {
    const answer = await this.ask.request({ file, ...question }).catch((error: unknown) => {
      console.warn('[definitions] lookup failed', error)

      return NONE
    })

    if (answer.kind !== 'found') return answer

    const { file: target, line, column } = answer.target

    return {
      kind: 'found',
      origin: answer.origin,
      target: { path: this.projectPath(rootPath, normalize(target)), line, column },
    }
  }

  private projectPath(rootPath: string, file: string): string {
    return insideRoot(rootPath, file) ?? insideRoot(this.realRoot(rootPath), file) ?? file
  }

  private realRoot(rootPath: string): string {
    const known = this.realRoots.get(rootPath)

    if (known !== undefined) return known

    let real = rootPath

    try {
      real = realpathSync.native(rootPath)
    } catch {
      // Корня нет на диске: проект закрывают - сверяемся с путём как есть.
    }

    this.realRoots.set(rootPath, real)

    return real
  }
}
