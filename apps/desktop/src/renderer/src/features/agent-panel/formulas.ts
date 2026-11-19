import type { render, KatexOptions } from 'katex'

/**
 * Как строится формула - и почему каждое значение названо, а не оставлено по
 * умолчанию. Лента несёт текст, за который никто не ручается (ответ модели, прочитанный
 * файл, страница из сети), а в окне лежит мост к главному процессу.
 * - `trust: false` - гейт на `\href`, `\includegraphics` и семейство `\html*`: ни
 *   ссылки мимо правила «только http(s) и в браузер», ни похода в сеть, ни своих
 *   data-атрибутов.
 * - `maxSize` и `maxExpand` - потолки: по умолчанию размер бесконечный, и один
 *   `\rule{100000em}{100000em}` из README раскладывал бы панель вокруг себя, а `\def`
 *   встроен, и только `maxExpand` стоит между самоопределяющимся макросом и зависанием.
 * - `throwOnError` - ошибку ловим сами: своя разметка ошибки у KaTeX - прибитый красный
 *   инлайном и системный title, а исходник формулы говорит больше.
 * - `fleqn` - формула-блок прижата влево, как блок кода и таблица рядом.
 * - `macros` не передаётся: KaTeX пишет в этот объект, и общий дал бы одной формуле
 *   переопределить команды для всех следующих.
 */
const OPTIONS: KatexOptions = {
  throwOnError: true,
  trust: false,
  strict: false,
  maxSize: 8,
  maxExpand: 1000,
  globalGroup: false,
  fleqn: true,
  output: 'htmlAndMathml',
}

/**
 * Сколько готовых формул держать: ответ перестраивается на каждом куске печати, и
 * разбор заново стоил бы полного прохода KaTeX на кадр, а весь разговор держать незачем.
 */
const CACHE_LIMIT = 300

let renderKatex: typeof render | null = null
let attempt: Promise<void> | null = null
let version = 0
const listeners = new Set<() => void>()

/** Готовые формулы: узел или null для той, что KaTeX не принял. Нет ключа - не строили. */
const built = new Map<string, Element | null>()

/** Подписка на приезд библиотеки - для useSyncExternalStore. */
export const subscribeFormulas = (listener: () => void) => {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/** Счётчик приезда библиотеки: снимок для useSyncExternalStore. */
export const formulasVersion = () => version

/**
 * Загрузить KaTeX и его стили - один раз, на первой формуле разговора и ни секундой
 * раньше: библиотека весит как пол-окна, а в разговоре про код формул обычно нет.
 * Стили едут тем же куском (Vite подключает CSS ленивого куска, когда тот грузится), и
 * формула не появляется голыми глифами до прихода стилей. Неудача окончательная: формулы
 * остаются исходником, а не долбят загрузку на каждом кадре печати.
 */
export const loadFormulas = () => {
  if (renderKatex || attempt) return

  attempt = Promise.all([import('katex'), import('./formula-katex.scss')])
    .then(([module]) => {
      renderKatex = module.render
      version += 1
      listeners.forEach((listener) => listener())
    })
    .catch((error: unknown) => console.warn('[agent-panel] KaTeX не загрузился:', error))
}

/** Положить формулу в кэш, выкинув самую давнюю, если места нет. */
const remember = (key: string, node: Element | null) => {
  if (built.size >= CACHE_LIMIT) {
    const oldest = built.keys().next()

    if (!oldest.done) built.delete(oldest.value)
  }

  built.set(key, node)

  return node
}

/**
 * Формула отдельным узлом, готовым к клонированию на место, - или null, пока библиотека
 * едет и когда формула не разбирается. Узел строит `render` через createElement, а не
 * `renderToString` в innerHTML: ни строчки HTML не разбирается, так что ничто внутри
 * формулы не станет разметкой.
 */
export const formulaNode = (latex: string, display: boolean): Element | null => {
  if (!renderKatex) return null

  const key = `${display ? 'd' : 'i'} ${latex}`
  const known = built.get(key)

  if (known !== undefined) {
    // Свежая формула - в конец очереди: та, что на экране печатающегося ответа, не
    // должна вылететь из кэша раньше давно забытой.
    built.delete(key)
    built.set(key, known)

    return known
  }

  try {
    const holder = document.createElement('span')

    renderKatex(latex, holder, { ...OPTIONS, displayMode: display })

    return remember(key, holder)
  } catch {
    return remember(key, null)
  }
}
