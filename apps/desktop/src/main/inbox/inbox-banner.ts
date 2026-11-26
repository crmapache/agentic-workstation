import type { InboxItem } from '@shared/inbox'

/**
 * Баннер ОС для уведомления IDE, когда окно не в фокусе: заголовок, от кого и строка сути.
 * Свой текст в баннере - только у сбоя (у окна он из i18n, у ОС его нет); остальное - слова
 * самого уведомления.
 */

const FAILURES: Record<string, string> = {
  noClaude: 'Claude Code is not installed.',
  noCli: 'The AI provider of this task is not installed.',
  folderMissing: 'The project folder is gone.',
  startFailed: 'The AI provider did not start.',
  crashed: 'The AI provider stopped unexpectedly.',
  turnError: 'The run ended with an error.',
  tooLong: 'The run took too long and was stopped.',
  ideClosed: 'The run was interrupted when the IDE closed.',
}

const BANNER_MAX = 180

/**
 * Разметку Markdown - прочь; «#12» в тексте - не заголовок, решётка уходит только в начале строки.
 * Строки остаются строками: время звонка и место не слипаются в одну фразу.
 */
const plain = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*#+\s*/, '')
        .replace(/[`*_>[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n')

const short = (text: string) =>
  text.length > BANNER_MAX ? `${text.slice(0, BANNER_MAX - 1)}…` : text

export const bannerOf = (item: InboxItem): { title: string; subtitle: string; body: string } => {
  const said =
    item.kind === 'question'
      ? (item.questions[0]?.question ?? '')
      : item.kind === 'permission'
        ? [item.tool, item.detail].filter(Boolean).join(': ')
        : item.kind === 'failure'
          ? (FAILURES[item.reason] ?? item.detail)
          : item.body

  return {
    title: item.title,
    subtitle: item.source && item.source !== item.title ? item.source : '',
    body: short(plain(said)),
  }
}
