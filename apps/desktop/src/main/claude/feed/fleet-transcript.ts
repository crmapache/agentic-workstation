import type { FleetTranscript } from '@shared/conversation-feed'

import { isRecord, recordField, stringField, parseCliLine } from '../cli/cli-messages'
import {
  AGENT_NAME,
  FLEET_MAX_STEPS,
  FLEET_STEP_CHARS,
  STRUCTURED_OUTPUT,
  FLEET_OUTPUT_CHARS,
  FLEET_PROMPT_CHARS,
  STEP_TARGET_FIELDS,
} from './agent-tasks.constants'

/** Имя агента CLI (hex и дефисы): приходит из окна и встаёт в путь - разделителю там не место. */
export const isAgentName = (value: string): boolean => AGENT_NAME.test(value)

const cut = (text: string, max: number) => (text.length <= max ? text : text.slice(0, max))

const blocksOf = (line: Record<string, unknown>) => {
  const content = recordField(line, 'message')['content']

  return Array.isArray(content) ? content.filter(isRecord) : []
}

/** Текст сообщения, как бы транскрипт его ни записал: строкой или блоками. */
const textOf = (line: Record<string, unknown>) => {
  const content = recordField(line, 'message')['content']

  if (typeof content === 'string') return content.trim()

  return blocksOf(line)
    .filter((block) => block['type'] === 'text')
    .map((block) => stringField(block, 'text'))
    .join('\n')
    .trim()
}

const stepOf = (name: string, input: Record<string, unknown>) => {
  const target = STEP_TARGET_FIELDS.map((field) => stringField(input, field).trim()).find(Boolean)

  return target ? `${name} ${cut(target.split('\n')[0] ?? '', FLEET_STEP_CHARS)}` : name
}

/**
 * Разговор агента флота из его транскрипта (agent-<id>.jsonl): задание - первое, что ему
 * сказали, шаги - его вызовы, ответ - последний текст или StructuredOutput. Отчёт CLI
 * несёт по 400 символов того и другого, а у агента со схемой это открывающая скобка JSON.
 * Читатель по строке: файл агента ревью - мегабайты, целиком в память он не нужен.
 */
export class FleetTranscriptReader {
  private prompt = ''
  private output = ''
  private readonly steps: string[] = []

  add(raw: string): void {
    const line = parseCliLine(raw)

    if (line?.type === 'user' && !this.prompt) this.prompt = textOf(line)
    if (line?.type !== 'assistant') return

    for (const block of blocksOf(line)) {
      const kind = stringField(block, 'type')

      if (kind === 'text') {
        const text = stringField(block, 'text').trim()

        if (text) this.output = text
      } else if (kind === 'tool_use') {
        const name = stringField(block, 'name')
        const input = recordField(block, 'input')

        if (name === STRUCTURED_OUTPUT) this.output = JSON.stringify(input)
        else if (name) this.steps.push(stepOf(name, input))
      }
    }

    // Последние шаги, а не первые: шаг читают, чтобы понять, докуда агент дошёл.
    if (this.steps.length > FLEET_MAX_STEPS * 2)
      this.steps.splice(0, this.steps.length - FLEET_MAX_STEPS)
  }

  result(): FleetTranscript {
    return {
      found: true,
      prompt: cut(this.prompt, FLEET_PROMPT_CHARS),
      steps: this.steps.slice(-FLEET_MAX_STEPS),
      output: cut(this.output, FLEET_OUTPUT_CHARS),
      truncated: this.output.length > FLEET_OUTPUT_CHARS,
    }
  }
}

/** Файла агента нет: прогон подмели или разговор открыт на другой машине. */
export const MISSING_TRANSCRIPT: FleetTranscript = {
  found: false,
  prompt: '',
  steps: [],
  output: '',
  truncated: false,
}

/** Разговор агента из строк транскрипта целиком (для теста и малых файлов). */
export const readFleetTranscript = (lines: Iterable<string>): FleetTranscript => {
  const reader = new FleetTranscriptReader()

  for (const line of lines) reader.add(line)

  return reader.result()
}
