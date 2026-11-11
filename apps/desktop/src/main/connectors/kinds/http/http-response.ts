/** Сколько ответа отдать модели: большие выгрузки съели бы контекст. */
const RESPONSE_LIMIT = 30_000

/** Байтов читать с запасом на многобайтные буквы: дальше лимита знаков всё равно не уйдёт. */
const BYTE_LIMIT = RESPONSE_LIMIT * 4

/** Текст для модели: JSON, XML, обычный текст. Нет заголовка - пробуем читать текстом. */
const TEXT_TYPE =
  /^(?:text\/|application\/(?:[\w.-]+\+)?(?:json|xml|javascript|yaml|x-yaml|csv|x-ndjson|x-www-form-urlencoded)\b)/i

const decode = (chunks: Uint8Array[]): string =>
  Buffer.concat(chunks).subarray(0, BYTE_LIMIT).toString('utf8')

/** Тело до потолка: дальше поток обрывается, а не тянется в память целиком. */
const readLimited = async (response: Response): Promise<{ text: string; cut: boolean }> => {
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader()

  if (!reader) return { text: '', cut: false }

  const chunks: Uint8Array[] = []
  let size = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) return { text: decode(chunks), cut: false }

    chunks.push(value)
    size += value.byteLength

    if (size > BYTE_LIMIT) {
      await reader.cancel().catch(() => undefined)

      return { text: decode(chunks), cut: true }
    }
  }
}

/**
 * Ответ сервиса текстом для модели. Не текст (файл, картинка) - короткая пометка без тела:
 * модели он всё равно пришёл бы мусором. Длинный - начало и пометка, что дальше обрезано.
 */
export const responseText = async (response: Response): Promise<string> => {
  const type = response.headers.get('content-type')

  if (type && !TEXT_TYPE.test(type)) {
    await response.body?.cancel().catch(() => undefined)

    const length = response.headers.get('content-length')

    return `(${type} response${length ? `, ${length} bytes` : ''}: not text, not shown)`
  }

  const { text, cut } = await readLimited(response)

  if (!cut && text.length <= RESPONSE_LIMIT) return text

  return `${text.slice(0, RESPONSE_LIMIT)}\n\n[truncated: the response is longer than ${RESPONSE_LIMIT} characters]`
}
