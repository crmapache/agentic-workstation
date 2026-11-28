import type { ModelInfo } from '@shared/conversation'

import type { Generation } from '../agents/models/model-generation'
import { parseGeneration, compareGenerations } from '../agents/models/model-generation'

/** Поколение в имени модели Kimi: «K3.1 Pro» - 3.1, «K3-256k» - 3, «K2.8 Preview» - 2.8. */
const GENERATION = /\bk(\d+(?:\.\d+)*)/i

/**
 * Поколение модели Kimi: по имени, иначе по id (`kimi-code/k3.1-pro`). Имя - первым: у
 * псевдонима `kimi-for-coding` номера в id нет, а имя от сервера («K2.8 Preview») его называет.
 * Номера нет нигде - null.
 */
const generationOf = (model: ModelInfo): Generation | null => {
  const found = GENERATION.exec(model.displayName)?.[1] ?? GENERATION.exec(model.value)?.[1]

  return found ? parseGeneration(found) : null
}

/**
 * Модели Kimi в порядке меню - новейшее поколение первым, как у Claude и Codex: меню показывает
 * первые сразу, а остальное прячет в свёрнутую группу. Сервер подписки дописывает новые модели в
 * конец списка (K2.8 Preview, K2.7 Code Highspeed, K3, K3-256k, K3.1 Pro), и без этого порядка
 * новейшие уходили в «Other models», а старые стояли наверху. Внутри поколения - порядок Kimi
 * (K3 перед K3-256k). Модель без номера (своя через `KIMI_MODEL_*`) не ранжируется - за
 * остальными, тоже в порядке Kimi.
 */
export const kimiLineup = (models: readonly ModelInfo[]): ModelInfo[] => {
  const known = models.flatMap((model) => {
    const generation = generationOf(model)

    return generation ? [{ model, generation }] : []
  })
  const newestFirst = known
    .toSorted((a, b) => compareGenerations(b.generation, a.generation))
    .map((entry) => entry.model)
  const ranked = new Set(newestFirst)

  return [...newestFirst, ...models.filter((model) => !ranked.has(model))]
}
