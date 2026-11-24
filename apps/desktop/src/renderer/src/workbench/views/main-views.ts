import { lazy } from 'react'
import {
  Bell,
  Plug,
  Puzzle,
  FileCode,
  Workflow,
  ChartColumn,
  CalendarDays,
  SquareKanban,
  CalendarClock,
} from 'lucide-react'

import type { MainViewId } from '../../state/layout.types'
import type { ViewDescriptor } from './views.types'

/**
 * Виды середины окна (зона 6) в порядке иконок полосы слева от неё. Файл - то, что
 * открыли из левой панели; трекер задач (ADR 0101), сценарии, задания по расписанию, статистика, коннекторы (ADR 0029) и
 * уведомления (ADR 0069), расширения (ADR 0091) - возможности всей IDE, а не одного провайдера LLM. Новый вид: id в MainViewId и MAIN_VIEW_IDS, компонент в своей
 * фиче, запись здесь. Коннекторы, расширения и уведомления открывают реже - их кнопки прижаты к
 * низу полосы, уведомления в самом низу.
 */
export const MAIN_VIEWS: readonly ViewDescriptor<MainViewId>[] = [
  {
    id: 'file',
    icon: FileCode,
    labelKey: 'mainViews.file',
    Component: lazy(() =>
      import('../../features/editor/EditorArea/EditorArea').then((module) => ({
        default: module.EditorArea,
      })),
    ),
  },
  {
    id: 'tracker',
    icon: SquareKanban,
    labelKey: 'mainViews.tracker',
    keywords: ['todo', 'task', 'tasks', 'board', 'kanban', 'cards', 'backlog'],
    Component: lazy(() =>
      import('../../features/tracker/TrackerView/TrackerView').then((module) => ({
        default: module.TrackerView,
      })),
    ),
  },
  {
    id: 'scenarios',
    icon: Workflow,
    labelKey: 'mainViews.scenarios',
    Component: lazy(() =>
      import('../../features/scenarios/ScenariosView/ScenariosView').then((module) => ({
        default: module.ScenariosView,
      })),
    ),
  },
  {
    id: 'tasks',
    icon: CalendarClock,
    labelKey: 'mainViews.tasks',
    keywords: ['schedule', 'scheduled', 'cron', 'routine', 'recurring', 'timer'],
    Component: lazy(() =>
      import('../../features/tasks/TasksView/TasksView').then((module) => ({
        default: module.TasksView,
      })),
    ),
  },
  {
    id: 'calendar',
    icon: CalendarDays,
    labelKey: 'mainViews.calendar',
    keywords: ['calls', 'meetings', 'events', 'schedule', 'overlaps', 'outlook', 'google calendar'],
    Component: lazy(() =>
      import('../../features/calendar/CalendarView/CalendarView').then((module) => ({
        default: module.CalendarView,
      })),
    ),
  },
  {
    id: 'statistics',
    icon: ChartColumn,
    labelKey: 'mainViews.statistics',
    Component: lazy(() =>
      import('../../features/statistics/StatisticsView/StatisticsView').then((module) => ({
        default: module.StatisticsView,
      })),
    ),
  },
  {
    id: 'connectors',
    group: 'bottom',
    icon: Plug,
    labelKey: 'mainViews.connectors',
    keywords: ['integrations', 'mcp', 'gmail', 'mail', 'notion', 'slack', 'calendar'],
    Component: lazy(() =>
      import('../../features/connectors/ConnectorsView/ConnectorsView').then((module) => ({
        default: module.ConnectorsView,
      })),
    ),
  },
  {
    id: 'extensions',
    group: 'bottom',
    icon: Puzzle,
    labelKey: 'mainViews.extensions',
    keywords: ['plugins', 'addons', 'store', 'marketplace', 'mods', 'customize'],
    Component: lazy(() =>
      import('../../features/extensions/ExtensionsView/ExtensionsView').then((module) => ({
        default: module.ExtensionsView,
      })),
    ),
  },
  {
    id: 'inbox',
    group: 'bottom',
    icon: Bell,
    labelKey: 'mainViews.inbox',
    keywords: ['inbox', 'reminders', 'remind', 'alerts', 'questions'],
    Component: lazy(() =>
      import('../../features/inbox/InboxView/InboxView').then((module) => ({
        default: module.InboxView,
      })),
    ),
  },
]

/**
 * Вид середины, чья кнопка стоит внизу левой полосы над настройками, а не в полосе видов
 * середины: статистику смотрят изредка, а полоса - для того, с чем работают весь день.
 */
export const FOOTER_MAIN_VIEW_ID: MainViewId = 'statistics'

/** Кнопки полосы видов середины - все виды, кроме того, что внизу левой полосы. */
export const MAIN_BAR_VIEWS = MAIN_VIEWS.filter((view) => view.id !== FOOTER_MAIN_VIEW_ID)
