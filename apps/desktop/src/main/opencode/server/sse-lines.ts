/**
 * Разбор потока Server-Sent Events (`GET /api/event` сервера OpenCode): куски приходят как
 * попало, событие кончается пустой строкой, данные - строки `data:` (несколько - через перевод
 * строки). Комментарии (`:`), `event:`, `id:` и `retry:` серверу OpenCode не нужны и
 * пропускаются.
 */
export class SseLines {
  private buffer = ''
  private data: string[] = []

  /** Кусок потока; ответ - данные событий, которые в нём закончились. */
  push(chunk: string): string[] {
    this.buffer += chunk

    const events: string[] = []
    let newline = this.buffer.indexOf('\n')

    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '')

      this.buffer = this.buffer.slice(newline + 1)
      newline = this.buffer.indexOf('\n')

      if (line === '') {
        if (this.data.length > 0) events.push(this.data.join('\n'))
        this.data = []
      } else if (line.startsWith('data:')) {
        this.data.push(line.slice(line.startsWith('data: ') ? 6 : 5))
      }
    }

    return events
  }
}
