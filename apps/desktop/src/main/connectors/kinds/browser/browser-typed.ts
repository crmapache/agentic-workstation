import { ToolOutput } from '../native-tools'
import { toolJson } from '../../connector-source'
import type { FieldCheck } from '../../../browser/page-actions'

/**
 * Ответ type с проверкой поля (ADR 0095): шапка, как у любого действия, текст поля по строкам и,
 * у редактора, его картинка. Модель сверяет строки, пустые строки и чат до Enter, не снимая
 * страницу заново. Текст - строкой JSON: в ней видны и пустые строки, и пробелы по краям.
 */
export const typedAnswer = (result: Record<string, unknown>, check: FieldCheck): ToolOutput => {
  const look = check.picture ? ' and the picture of the field below' : ''

  return new ToolOutput({
    content: [
      ...toolJson(result).content,
      {
        type: 'text',
        text: `The field now reads ${JSON.stringify(check.text)} (\\n is a line break, \\n\\n a blank line). Before you send a message with Enter, check it${look}: the lines, the blank lines, the right chat.`,
      },
      ...(check.picture
        ? [{ type: 'image' as const, data: check.picture.data, mimeType: check.picture.mimeType }]
        : []),
    ],
  })
}
