import type { PushNotice, PushReason } from '@agentic-workstation/remote-protocol/push'

import type { Route } from '../lib/routes'
import { routePath } from '../lib/routes'
import type { OpenedPush } from './push-open'

/**
 * Слова уведомления - из строк телефона (раздел push в locales/en.json): воркер получает их при
 * сборке, i18next в нём нет. IDE шлёт данными, кто и почему, а не готовый текст.
 */
export type PushStrings = {
  title: string
  body: string
  providers: Record<string, string>
  scenario: string
  titles: Record<PushReason, string>
  bodies: Record<Exclude<PushReason, 'held'>, string> & {
    limitUnknown: string
    held: Record<'stopAfter' | 'failed' | 'refused', string>
  }
}

/** Что показать: заголовок, текст, тег (новое того же разговора заменяет старое), куда вести. */
export type ShownPush = { title: string; body: string; tag: string; url: string }

/** Общий тег на «IDE ждёт тебя»: нераскрытое не копится стопкой. */
export const GENERIC_TAG = 'agentic-workstation'

const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => values[name] ?? whole)

const routeOf = (agentId: string, route: PushNotice['route']): Route => {
  switch (route.screen) {
    case 'conversation':
      return { name: 'conversation', agentId, ...route }
    case 'queue':
      return { name: 'queue', agentId, ...route }
    case 'run':
      return { name: 'run', agentId, ...route }
  }
}

const bodyOf = (
  notice: PushNotice,
  strings: PushStrings,
  values: Record<string, string>,
): string => {
  if (notice.reason === 'held') {
    const words = strings.bodies.held[notice.detail as keyof PushStrings['bodies']['held']]

    return fill(words ?? strings.body, values)
  }

  if (notice.reason === 'limit' && notice.until <= 0)
    return fill(strings.bodies.limitUnknown, values)

  return fill(strings.bodies[notice.reason], values)
}

const clock = (at: number): string =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(at)

/**
 * Уведомление по открытому пушу: кто (провайдер разговора или сценарий), где (проект), что
 * (повод) и куда ведёт нажатие. Не открылся - общее слово и главный экран.
 */
export const shownPush = (
  opened: OpenedPush | null,
  strings: PushStrings,
  formatTime: (at: number) => string = clock,
): ShownPush => {
  if (!opened) return { title: strings.title, body: strings.body, tag: GENERIC_TAG, url: '/' }

  const { notice, agentId } = opened
  const who =
    notice.route.screen === 'conversation'
      ? (strings.providers[notice.provider] ?? notice.provider)
      : strings.scenario
  const values = {
    who,
    project: notice.project,
    title: notice.title,
    tool: notice.tool,
    time: notice.until > 0 ? formatTime(notice.until) : '',
  }

  return {
    title: fill(strings.titles[notice.reason], values),
    body: bodyOf(notice, strings, values),
    // Тег - на IDE и разговор (очередь): у двух машин одинаковых id не бывает, но и спорить незачем.
    tag: `${agentId}:${notice.tag}`,
    url: routePath(routeOf(agentId, notice.route)),
  }
}
