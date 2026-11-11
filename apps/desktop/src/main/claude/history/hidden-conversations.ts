/** Разговоры прогонов проекта: голова и карточки - их нет ни в истории, ни в поиске. */
export type HiddenConversations = (projectPath: string) => Promise<ReadonlySet<string>>

let source: HiddenConversations | null = null

/**
 * Узкий хук истории для чужих разговоров Claude в папке проекта - голов и карточек прогонов
 * сценариев (ADR 0039): их книжку держит сервис сценариев (scenarios/store/hidden-book.ts),
 * история и поиск панели только спрашивают. Нет сервиса (тесты) - скрывать нечего.
 */
export const setHiddenConversations = (hidden: HiddenConversations | null): void => {
  source = hidden
}

export const hiddenConversations = (projectPath: string): Promise<ReadonlySet<string>> =>
  source ? source(projectPath).catch(() => new Set<string>()) : Promise.resolve(new Set<string>())
