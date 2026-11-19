import type { ExtensionRuntime } from './extension-runtime'

/** Сколько ждать хук перед отправкой и охрану разрешения: дольше - как будто хука нет. */
export const REWRITE_WAIT_MS = 3000
export const GUARD_WAIT_MS = 2000
/** Самый длинный текст сообщения после хука. */
const TEXT_MAX = 200_000

type Subscriber = { runtime: ExtensionRuntime; handler: number }
type Dispatch = (runtime: ExtensionRuntime, handler: number, args: unknown[]) => Promise<unknown>

const TIMED_OUT = Symbol('timed out')

const within = async (work: Promise<unknown>, ms: number): Promise<unknown> => {
  let timer: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      work.catch(() => undefined),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * Хуки расширений по порядку (ADR 0091). Переписывание - цепочкой: каждое следующее видит текст
 * после предыдущего. Охрана - до первого отказа. Наблюдение - всем сразу, без ожидания. Хук,
 * который не успел или упал, ничего не меняет: разговор не ждёт расширение дольше срока.
 */
export const runHooks = (subscribers: readonly Subscriber[], dispatch: Dispatch) => ({
  rewrite: async <T extends { text: string }>(context: T): Promise<string> => {
    let text = context.text

    for (const { runtime, handler } of subscribers) {
      const result = await within(
        dispatch(runtime, handler, [{ ...context, text }]),
        REWRITE_WAIT_MS,
      )
      const next =
        typeof result === 'string' ? result : isRecord(result) ? result['text'] : undefined

      if (typeof next === 'string' && next.trim()) text = next.slice(0, TEXT_MAX)
    }

    return text
  },
  guard: async (context: object): Promise<string | null> => {
    for (const { runtime, handler } of subscribers) {
      const result = await within(dispatch(runtime, handler, [context]), GUARD_WAIT_MS)
      const deny = isRecord(result) ? result['deny'] : undefined

      if (typeof deny === 'string' && deny.trim()) return deny.slice(0, 2000)
      if (deny === true) return `Blocked by the "${runtime.manifest.name}" extension.`
    }

    return null
  },
  notify: (context: object): void => {
    for (const { runtime, handler } of subscribers) {
      dispatch(runtime, handler, [context]).catch(() => undefined)
    }
  },
})
