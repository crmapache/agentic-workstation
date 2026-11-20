import type { CommitDiff } from './commit-diff'

/** Сообщение коммита по схеме: строка темы и тело (пустое, если теме хватает). */
export const COMMIT_MESSAGE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    subject: { type: 'string', description: 'One-line commit subject.' },
    body: { type: 'string', description: 'Commit body, or an empty string.' },
  },
  required: ['subject', 'body'],
  additionalProperties: false,
}

/**
 * Вопрос модели: что уйдёт коммитом и как пишет этот репозиторий. Стиль - по прошлым темам
 * (префиксы, язык, длина), а не наш: у каждого проекта свой.
 */
export const commitPrompt = (diff: CommitDiff): string =>
  [
    'Write the git commit message for the changes below. They are committed all together.',
    '',
    'Rules:',
    '- Follow the style and language of the recent commit subjects of this repository: the same prefixes (like "feat:" or "fix:") only if they use them, a similar length.',
    '- The subject is one line in the imperative mood and says what the change does, without a trailing period.',
    '- The body explains what and why when the subject is not enough; otherwise it is an empty string. Wrap it at 72 columns.',
    '- Describe only what is in the changes. No mention of AI, no "Co-Authored-By" lines.',
    '',
    'Recent commit subjects:',
    diff.recent.length > 0 ? diff.recent.map((subject) => `- ${subject}`).join('\n') : '(none yet)',
    '',
    'Changed files:',
    diff.files,
    '',
    'Summary:',
    diff.stat,
    '',
    diff.truncated ? 'Diff (cut short, the file list above is complete):' : 'Diff:',
    diff.patch || '(too large to show)',
  ].join('\n')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Сообщение из ответа модели: тема - одной строкой, тело - если есть; темы нет - null. */
export const commitMessageOf = (output: unknown): string | null => {
  if (!isRecord(output) || typeof output['subject'] !== 'string') return null

  const subject = output['subject'].trim().split('\n')[0]?.trim() ?? ''
  const body = typeof output['body'] === 'string' ? output['body'].trim() : ''

  if (!subject) return null

  return body ? `${subject}\n\n${body}` : subject
}
