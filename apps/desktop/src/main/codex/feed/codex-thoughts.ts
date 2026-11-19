/**
 * Размышление Codex простым текстом. Сводка рассуждений приходит с разметкой: каждая часть
 * начинается заголовком `**Так-то**`, а лента показывает размышление как есть, и звёздочки
 * вылезали в шапку карточки THINK. Незакрытая пара (кусок ещё идёт) остаётся до закрытия.
 */
export const plainThought = (text: string): string => text.replaceAll(/\*\*(.+?)\*\*/g, '$1')

/** Части рассуждения (`summaryIndex`, `contentIndex`) - абзацами, а не слитно. */
const PART_GAP = '\n\n'

/**
 * Сырой текст размышлений по кускам: чистится весь текст каждый раз, а не кусок, - пара
 * звёздочек часто приходит в разных кусках. Новая часть начинается с новой строки.
 */
export class CodexThoughts {
  private readonly raw = new Map<string, { text: string; part: number }>()

  /** Кусок части `part` размышления `itemId`; вернёт весь текст, уже чистый. */
  append(itemId: string, delta: string, part: number): string {
    const known = this.raw.get(itemId)
    const gap = known && part !== known.part && known.text ? PART_GAP : ''
    const text = (known?.text ?? '') + gap + delta

    this.raw.set(itemId, { text, part })

    return plainThought(text)
  }

  /** Размышление кончилось: его сырой текст больше не нужен. */
  forget(itemId: string): void {
    this.raw.delete(itemId)
  }
}
