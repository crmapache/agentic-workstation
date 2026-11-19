/**
 * Окно контекста модели Ollama - то, с которым сервер её на самом деле держит, а не её предел
 * из `model_info`. Через вход в формате OpenAI (им ходит OpenCode) окно запросом не задать:
 * сервер берёт своё num_ctx модели (PARAMETER в Modelfile), иначе своё по умолчанию
 * (OLLAMA_CONTEXT_LENGTH, ползунок приложения или по памяти видеокарты), и не больше предела
 * модели. Своё по умолчанию сервер не называет - его видно только по загруженным моделям
 * (`/api/ps`). Скажи IDE OpenCode окно больше настоящего - разговор не сожмётся вовремя, а
 * Ollama молча отрежет начало: модель потеряет указания и инструменты.
 */

/** Что известно об окне модели: предел модели, её своё num_ctx, окно загруженной; null - нет. */
export type OllamaWindowFacts = { max: number | null; own: number | null; loaded: number | null }

/**
 * Окно сервера по умолчанию, выведенное из загруженных моделей. exact - ровно оно (модель
 * загружена с окном меньше своего предела); иначе - «не меньше» (окно упёрлось в предел модели).
 */
export type ServerWindow = { tokens: number; exact: boolean } | null

/** num_ctx модели из `parameters` ответа `/api/show`; не задано - null. */
export const ownContextOf = (parameters: string): number | null => {
  const tokens = Number(/^num_ctx\s+(\d+)\s*$/m.exec(parameters)?.[1])

  return Number.isFinite(tokens) && tokens > 0 ? tokens : null
}

/**
 * Окно сервера по загруженным сейчас моделям; ничего не загружено - прежнее знание. Точное
 * берётся наибольшим: Ollama может урезать окно большой модели, чтобы она влезла в память, -
 * такое меньше настоящего. «Не меньше» прежнего знания не отменяет, если с ним не спорит:
 * больше прежнего - сервер перезапустили с другим окном.
 */
export const learnServerWindow = (
  models: readonly OllamaWindowFacts[],
  previous: ServerWindow,
): ServerWindow => {
  const seen = models.filter((model) => model.loaded !== null && model.own === null)
  const exact = seen.filter((model) => model.max !== null && (model.loaded ?? 0) < model.max)
  const best = (list: readonly OllamaWindowFacts[]) =>
    Math.max(...list.map((model) => model.loaded ?? 0))

  if (exact.length > 0) return { tokens: best(exact), exact: true }
  if (seen.length === 0) return previous

  const floor = best(seen)

  return previous && previous.tokens >= floor ? previous : { tokens: floor, exact: false }
}

/**
 * Окно модели известно наверняка: она загружена, у неё своё num_ctx или окно сервера точное либо
 * «не меньше» её предела. Иначе это догадка - модель стоит загрузить и спросить сервер.
 */
export const isWindowSure = (facts: OllamaWindowFacts, server: ServerWindow): boolean =>
  facts.loaded !== null ||
  facts.own !== null ||
  (server !== null && (server.exact || (facts.max !== null && facts.max <= server.tokens)))

/**
 * Окно модели для OpenCode и меню: загруженной - какое есть; со своим num_ctx - оно в пределе
 * модели; иначе - окно сервера в пределе модели. Сервер «не меньше» - его нижняя граница:
 * меньшее окно лишь раньше сожмёт разговор, большее - потеряло бы его начало. Неизвестно - null.
 */
export const ollamaWindow = (facts: OllamaWindowFacts, server: ServerWindow): number | null => {
  if (facts.loaded !== null) return facts.loaded

  const tokens = facts.own ?? server?.tokens ?? null

  if (tokens === null) return null

  return facts.max === null ? tokens : Math.min(tokens, facts.max)
}
