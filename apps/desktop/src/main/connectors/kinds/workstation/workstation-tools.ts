import { NativeSource, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { WorkstationLink, WorkstationPorts } from '../../../workstation/workstation-link'
import { scopedPorts } from '../../../workstation/workstation-scope'
import { CALENDAR_TOOLS } from './calendar-tools'
import { CONVERSATION_TOOLS } from './conversation-tools'
import { EXTENSION_TOOLS } from './extension-tools'
import { PROJECT_TOOLS } from './project-tools'
import { QUEUE_TOOLS } from './queue-tools'
import { RUN_TOOLS } from './run-tools'
import { SCENARIO_TOOLS } from './scenario-tools'
import { TASK_TOOLS } from './task-tools'
import { TRACKER_TOOLS } from './tracker-tools'
import { isOutside } from './workstation-args'

/**
 * Инструменты самой IDE (ADR 0090): то, что окно делает с проектами, сценариями, очередями,
 * заданиями, трекером задач и разговорами, - теми же сервисами, без мыши. Ступени: чтение и
 * запись; людям ничего не отправляется - outbound нет.
 */
export const WORKSTATION_TOOLS: NativeTool<WorkstationPorts>[] = [
  ...PROJECT_TOOLS,
  ...SCENARIO_TOOLS,
  ...QUEUE_TOOLS,
  ...RUN_TOOLS,
  ...TASK_TOOLS,
  ...TRACKER_TOOLS,
  ...CONVERSATION_TOOLS,
  ...EXTENSION_TOOLS,
  ...CALENDAR_TOOLS,
]

/** Инструменты на чтение: шлюз разрешает их CLI без вопроса человеку. */
export const WORKSTATION_READ_TOOLS: readonly string[] = WORKSTATION_TOOLS.filter(
  (tool) => tool.access === 'read',
).map((tool) => tool.name)

/**
 * Инструмент зовёт порты, когда IDE поднялась: до того - просьба подождать. Разговор IDE видит
 * только проекты, где человек оставил коннектор; вход снаружи (без проекта) - все: его включил
 * человек на всю IDE.
 */
const ready =
  (allowed: (projectPath: string) => boolean) =>
  (tool: NativeTool<WorkstationPorts>): NativeTool<WorkstationLink> => ({
    ...tool,
    run: (args, link, call) =>
      tool.run(args, isOutside(call) ? link.ready : scopedPorts(link.ready, allowed), call),
  })

export const createWorkstationSource = (
  link: WorkstationLink,
  allowed: (projectPath: string) => boolean = () => true,
) => new NativeSource(WORKSTATION_TOOLS.map(ready(allowed)), link, [ArgumentError])
