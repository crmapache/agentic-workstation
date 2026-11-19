import type { ModelInfo } from '@shared/conversation'

/**
 * Уровни моделей Codex - сильнейший первым, по описаниям каталога: Astra - «complex coding and
 * professional work», Sol - «near-Astra performance at a lower cost», Terra - экономная и
 * сбалансированная, Luna - «fast and affordable». Уровень - слово в идентификаторе
 * (`gpt-6.1-sol`), как семья у Claude.
 */
export const CODEX_TIERS: readonly string[] = ['astra', 'sol', 'terra', 'luna']

const tierOf = (model: string): string | undefined =>
  model
    .toLowerCase()
    .split('-')
    .find((part) => CODEX_TIERS.includes(part))

/** Поколение из идентификатора: `gpt-6.1-sol` - [6, 1]; номера нет - пусто. */
const versionOf = (model: string): number[] =>
  model
    .split('-')
    .find((part) => /^\d+(\.\d+)*$/.test(part))
    ?.split('.')
    .map(Number) ?? []

/** Новее ли поколение a, чем b: «6.1» новее «6», «6» новее «5.6». */
const isNewer = (a: readonly number[], b: readonly number[]): boolean => {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const step = (a[index] ?? 0) - (b[index] ?? 0)

    if (step !== 0) return step > 0
  }

  return false
}

/**
 * Каталог Codex в порядке меню, как у Claude: сначала линейка - новейшая модель каждого уровня,
 * сильнейшая первой, за ней остальное в порядке Codex (старые поколения - в свёрнутую группу).
 * Сам Codex ставит первой модель по умолчанию, а старые поколения вперемешку с новыми. Модель
 * без знакомого уровня остаётся на своём месте среди остальных: незнакомые имена не ранжируются.
 */
export const lineupFirst = (models: readonly ModelInfo[]): ModelInfo[] => {
  const heads = new Map<string, ModelInfo>()

  for (const model of models) {
    const tier = tierOf(model.value)
    const head = tier ? heads.get(tier) : undefined

    if (tier && (!head || isNewer(versionOf(model.value), versionOf(head.value)))) {
      heads.set(tier, model)
    }
  }

  const lineup = CODEX_TIERS.flatMap((tier) => heads.get(tier) ?? [])
  const inLineup = new Set(lineup)

  return [...lineup, ...models.filter((model) => !inLineup.has(model))]
}
