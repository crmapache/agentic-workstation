/** Разговоры проекта, которые подняла сама IDE: их нет ни в истории, ни в поиске панели. */
export type HiddenConversations = (projectPath: string) => Promise<ReadonlySet<string>>

const sources = new Map<string, HiddenConversations>()

/**
 * Узкий хук истории для чужих разговоров Claude в папке проекта: голов и карточек прогонов
 * сценариев (ADR 0039) и прогонов заданий (ADR 0069). Книжки держат их сервисы, каждый под
 * своим именем; история и поиск панели только спрашивают. null - сервис ушёл, его книжки нет.
 */
export const setHiddenConversations = (owner: string, hidden: HiddenConversations | null): void => {
  if (hidden) sources.set(owner, hidden)
  else sources.delete(owner)
}

export const hiddenConversations = async (projectPath: string): Promise<ReadonlySet<string>> => {
  const found = await Promise.all(
    [...sources.values()].map((source) => source(projectPath).catch(() => new Set<string>())),
  )

  return new Set(found.flatMap((set) => [...set]))
}
