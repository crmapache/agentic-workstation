/** Ответы на вопросы сценария одной строкой: «what: src, depth: 2». */
export const inputsText = (inputs: Record<string, string>, limit = 160): string => {
  const line = Object.entries(inputs)
    .filter(([, value]) => value.trim() !== '')
    .map(([key, value]) => `${key}: ${value.replace(/\s+/g, ' ')}`)
    .join(', ')

  return line.length > limit ? `${line.slice(0, limit)}…` : line
}
