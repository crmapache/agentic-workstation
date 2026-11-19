import { newVariant, newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core'
import type { QuickJSHandle, QuickJSContext, QuickJSRuntime } from 'quickjs-emscripten-core'

import variant from '@jitl/quickjs-wasmfile-release-sync'
import type { ExtensionProblem, ExtensionLogEntry } from '@shared/extensions'

import { ModuleError, ModuleFiles, normalizeModule } from './module-files'
import { PRELUDE_API } from './prelude-api'
import { PRELUDE_CORE } from './prelude-core'
import { SandboxTimers } from './sandbox-timers'
import type { SandboxLimits } from './sandbox.constants'
import { BOOT_MODULE, START_WAIT_MS, SANDBOX_LIMITS } from './sandbox.constants'
import {
  bootCode,
  problemOf,
  cappedMemory,
  ACTIVATE_CODE,
  SandboxBroken,
  DEACTIVATE_CODE,
} from './sandbox.utils'

/** Что песочнице нужно снаружи: вызов IDE, журнал и весть, что она сломалась сама. */
export type SandboxHost = {
  call: (method: string, payload: string) => Promise<string>
  log: (level: ExtensionLogEntry['level'], text: string) => void
  /** Сломалась вне вызова IDE (таймер ушёл за срок, кончилась память): её больше нет. */
  broke: (problem: ExtensionProblem) => void
}

export type SandboxSpec = {
  id: string
  dir: string
  main: string
  info: { id: string; name: string; version: string }
}

/**
 * Песочница одного расширения (ADR 0091): свой модуль WASM QuickJS со своей памятью (потолок -
 * память WebAssembly, а не счёт QuickJS: без malloc_usable_size он не считает строки), срок на
 * каждый заход в код расширения и прелюдия с `ide`. Наружу - только JSON через SandboxHost.
 * Ошибка в обработчике - ответ вызову; срок или память - песочница сломана целиком.
 */
export class ExtensionSandbox {
  private deadline = 0
  private broken: ExtensionProblem | null = null
  private disposed = false
  private readonly waiting = new Set<(error: Error) => void>()
  private readonly timers: SandboxTimers

  private constructor(
    private readonly spec: SandboxSpec,
    private readonly host: SandboxHost,
    private readonly limits: SandboxLimits,
    private readonly runtime: QuickJSRuntime,
    private readonly context: QuickJSContext,
  ) {
    this.timers = new SandboxTimers(limits, (handler, once) => this.fire(handler, once))
  }

  static async create(
    spec: SandboxSpec,
    host: SandboxHost,
    limits: SandboxLimits = SANDBOX_LIMITS,
  ): Promise<ExtensionSandbox> {
    const quickjs = await newQuickJSWASMModuleFromVariant(
      newVariant(variant, { wasmMemory: cappedMemory(limits) as never }),
    )
    const runtime = quickjs.newRuntime()

    runtime.setMaxStackSize(limits.stackBytes)

    const sandbox = new ExtensionSandbox(spec, host, limits, runtime, runtime.newContext())

    runtime.setInterruptHandler(() => Date.now() > sandbox.deadline)

    return sandbox
  }

  /** Прелюдия, модуль расширения и его activate. Отказ - SandboxBroken с причиной. */
  async start(): Promise<void> {
    const files = new ModuleFiles(this.spec.dir)

    this.runtime.setModuleLoader(
      (name) => {
        try {
          return files.read(name)
        } catch (error) {
          return { error: error instanceof Error ? error : new ModuleError(String(error)) }
        }
      },
      (base, request) => {
        try {
          return request === BOOT_MODULE ? request : normalizeModule(base, request)
        } catch (error) {
          return { error: error instanceof Error ? error : new ModuleError(String(error)) }
        }
      },
    )
    this.installHost()
    this.script(`globalThis.__aw_extension = ${JSON.stringify(this.spec.info)}`, 'info.js')
    this.script(PRELUDE_CORE + PRELUDE_API, 'prelude.js')

    const loaded = this.settle(
      this.enter(() =>
        this.context.evalCode(bootCode(this.spec.main), BOOT_MODULE, { type: 'module' }),
      ),
      'load',
    )

    await loaded
    // activate может ждать человека (вопрос в окне): запуск не держит его дольше START_WAIT_MS.
    await Promise.race([
      this.settle(
        this.enter(() => this.context.evalCode(ACTIVATE_CODE, 'activate.js')),
        'load',
      ),
      new Promise((resolve) => setTimeout(resolve, START_WAIT_MS)),
    ])
  }

  /** Позвать колбэк расширения по номеру. Ответ - его значение; ошибка - его исключение. */
  async dispatch(handler: number, args: readonly unknown[]): Promise<unknown> {
    this.assertAlive()

    const { context } = this
    const fn = context.getProp(context.global, '__aw_dispatch')
    const id = context.newNumber(handler)
    const payload = context.newString(JSON.stringify(args))
    const called = this.enter(() => context.callFunction(fn, context.undefined, [id, payload]))

    fn.dispose()
    id.dispose()
    payload.dispose()

    const raw = await this.settle(called, 'crash')
    const answer = JSON.parse(raw) as { ok: true; value: unknown } | { ok: false; error: string }

    if (answer.ok) return answer.value

    // Нехватку памяти расширение могло поймать само, но жить ему уже не на чем.
    if (answer.error === 'out of memory') {
      throw this.failure(problemOf({ message: answer.error }, 'memory'), true)
    }

    throw new Error(answer.error)
  }

  /** Колбэк больше не нужен: IDE сняла регистрацию. */
  forget(handler: number): void {
    if (this.disposed || this.broken) return

    const fn = this.context.getProp(this.context.global, '__aw_forget')
    const id = this.context.newNumber(handler)
    const result = this.enter(() => this.context.callFunction(fn, this.context.undefined, [id]))

    fn.dispose()
    id.dispose()
    result.dispose()
  }

  /** deactivate расширения (если есть и жива), таймеры, ждущие ответы, память. */
  async stop(): Promise<void> {
    if (this.disposed) return

    if (!this.broken) {
      await Promise.race([
        this.settle(
          this.enter(() => this.context.evalCode(DEACTIVATE_CODE, 'deactivate.js')),
          'crash',
        ).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, this.limits.sliceMs)),
      ])
    }

    this.dispose(new Error('The extension stopped.'))
  }

  private installHost() {
    const { context } = this
    const host = context.newFunction('__aw_host', (methodHandle, payloadHandle) => {
      const method = context.getString(methodHandle)
      const payload = context.getString(payloadHandle)
      const deferred = context.newPromise()
      const answer = (raw: string) => {
        if (this.disposed || !deferred.alive) return

        const value = context.newString(raw)

        deferred.resolve(value)
        value.dispose()
        deferred.dispose()
        this.pump()
      }

      this.host.call(method, payload).then(answer, (error: unknown) =>
        answer(
          JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      )

      return deferred.handle
    })
    const log = context.newFunction('__aw_log', (levelHandle, textHandle) => {
      const level = context.getString(levelHandle)

      this.host.log(
        level === 'warn' || level === 'error' || level === 'info' ? level : 'log',
        context.getString(textHandle),
      )
    })
    const timerSet = context.newFunction('__aw_timer_set', (handler, ms, repeat) =>
      context.newNumber(
        this.timers.set(
          context.getNumber(handler),
          context.getNumber(ms),
          context.dump(repeat) === true,
        ),
      ),
    )
    const timerClear = context.newFunction('__aw_timer_clear', (id) => {
      this.timers.clear(context.getNumber(id))
    })

    const installed: [string, QuickJSHandle][] = [
      ['__aw_host', host],
      ['__aw_log', log],
      ['__aw_timer_set', timerSet],
      ['__aw_timer_clear', timerClear],
    ]

    for (const [name, fn] of installed) {
      context.setProp(context.global, name, fn)
      fn.dispose()
    }
  }

  private script(code: string, filename: string) {
    const result = this.enter(() => this.context.evalCode(code, filename))

    if (result.error) {
      const problem = problemOf(this.context.dump(result.error), 'engine')

      result.error.dispose()
      this.break(problem)
      throw new SandboxBroken(problem)
    }

    result.value.dispose()
  }

  /** Зайти в код расширения со сроком: всё, что дольше sliceMs, QuickJS прервёт. */
  private enter<T>(run: () => T): T {
    this.deadline = Date.now() + this.limits.sliceMs

    try {
      return run()
    } finally {
      this.deadline = Number.MAX_SAFE_INTEGER
    }
  }

  /** Выполнить отложенные задачи промисов. Срок или память на этом шаге - песочница сломана. */
  private pump() {
    if (this.disposed || this.broken) return

    const result = this.enter(() => this.runtime.executePendingJobs())

    if (!result.error) return

    const problem = problemOf(this.context.dump(result.error), 'crash')

    result.error.dispose()

    if (problem.code === 'timeout' || problem.code === 'memory') this.break(problem)
    else this.host.log('error', problem.detail)
  }

  /**
   * Довести результат захода до строки или значения: промис - через задачи QuickJS. Сломалась
   * песочница, пока ждали, - ждущий получает её причину, а не висит вечно.
   */
  private async settle(
    called: ReturnType<QuickJSContext['evalCode']>,
    code: ExtensionProblem['code'],
  ): Promise<string> {
    const { context } = this

    if (called.error) {
      const problem = problemOf(context.dump(called.error), code)

      called.error.dispose()

      throw this.failure(problem, code === 'load')
    }

    const settled = context.resolvePromise(called.value)

    called.value.dispose()
    this.pump()

    const outcome = await new Promise<Awaited<typeof settled>>((resolve, reject) => {
      this.waiting.add(reject)
      settled.then(resolve, reject).finally(() => this.waiting.delete(reject))
    })

    if (outcome.error) {
      const problem = problemOf(context.dump(outcome.error), code)

      outcome.error.dispose()

      throw this.failure(problem, code === 'load')
    }

    const value = outcome.value
    const text = context.typeof(value) === 'string' ? context.getString(value) : ''

    value.dispose()

    return text
  }

  /**
   * Ошибка захода: срок и память ломают песочницу всегда, сбой загрузки - тоже (без модуля
   * расширения нет), остальное - просто исключение вызова.
   */
  private failure(problem: ExtensionProblem, fatal: boolean): Error {
    if (!fatal && problem.code !== 'timeout' && problem.code !== 'memory') {
      return new Error(problem.detail)
    }

    this.break(problem)

    return new SandboxBroken(problem)
  }

  private fire(handler: number, once: boolean) {
    if (this.disposed || this.broken) return

    this.dispatch(handler, [])
      .catch((error: unknown) => {
        if (error instanceof SandboxBroken) this.host.broke(error.problem)
      })
      .finally(() => {
        if (once) this.forget(handler)
      })
  }

  private break(problem: ExtensionProblem) {
    if (this.broken) return

    this.broken = problem
    this.dispose(new SandboxBroken(problem))
  }

  private assertAlive() {
    if (this.broken) throw new SandboxBroken(this.broken)
    if (this.disposed) throw new Error('The extension stopped.')
  }

  private dispose(reason: Error) {
    if (this.disposed) return

    this.disposed = true
    this.timers.clearAll()

    for (const reject of this.waiting) reject(reason)

    this.waiting.clear()

    // Память модуля уйдёт вместе с ним: недоосвобождённые ручки после сбоя - не повод падать.
    try {
      this.context.dispose()
      this.runtime.dispose()
    } catch {
      // модуль WASM этой песочницы больше никто не держит
    }
  }
}
