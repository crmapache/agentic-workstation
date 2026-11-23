import { join } from 'node:path'

import { powerMonitor } from 'electron'

import type { CalendarSource, GoogleCalendarsOutcome } from '@shared/calendar'
import type { ProviderId } from '@shared/providers'

import type { ClaudeService } from '../claude/claude-service'
import type { ConnectorsService } from '../connectors/connectors-service'
import type { InboxService } from '../inbox/inbox-service'
import { broadcast } from '../ipc/broadcast'
import type { ScenarioProvider } from '../providers/scenario-provider'
import { ELECTRON_CIPHER } from '../storage/electron-cipher'
import { Vault } from '../storage/vault'
import { CalendarService } from './calendar-service'
import type { SourceResult } from './calendar-snapshot'
import { CalendarStore } from './calendar-store'
import { CalendarSync } from './calendar-sync'
import type { SyncWindow } from './calendar-window'
import { CalendarAiReader } from './ai/calendar-ai-run'
import { readGoogle, listGoogleCalendars } from './sources/google-source'
import { readIcs } from './sources/ics-source'

export type CalendarRuntime = {
  service: CalendarService
  sync: CalendarSync
  /** Календари аккаунта Google коннектора - для формы источника. */
  googleCalendars: (connectorId: string) => Promise<GoogleCalendarsOutcome>
  shutdown: () => void
}

const machineZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** Прямое чтение: Google - входом коннектора, ICS - по ссылке из хранилища. */
const directReader =
  (service: CalendarService, connectors: ConnectorsService) =>
  async (
    source: CalendarSource,
    window: SyncWindow,
    signal: AbortSignal,
  ): Promise<SourceResult> => {
    const read =
      source.kind === 'google'
        ? await (async () => {
            const session = connectors.calendar.google(source.connectorId, signal)

            if (typeof session === 'string') return { ok: false as const, failure: session }

            return readGoogle(
              (url, request) => session.request(url, request),
              source.calendarIds,
              source.id,
              window,
              signal,
            )
          })()
        : source.kind === 'ics'
          ? await (async () => {
              const url = service.icsUrl(source.id)

              if (!url) return { ok: false as const, failure: 'vault-unavailable' as const }

              return readIcs(url, source.id, window, signal, machineZone())
            })()
          : { ok: false as const, failure: 'provider-unsupported' as const }

    return read.ok ? { ...read, covered: window, byAi: false } : read
  }

/**
 * Календарь звонков (ADR 0114): `calendar.json`, `calendar-events.json` и ссылки ICS в своём
 * `calendar.vault`, движок синка с таймером и чтением после сна, ИИ-читатель через шлюз с
 * допуском. Новые накладки - карточкой в уведомлениях IDE. Stop в капсуле Computer гасит и
 * чтение календаря по экрану.
 */
export const startCalendar = async (setup: {
  dataDir: string
  claude: ClaudeService
  runners: ReadonlyMap<ProviderId, ScenarioProvider>
  connectors: ConnectorsService
  inbox: InboxService
}): Promise<CalendarRuntime> => {
  const vault = await Vault.load(join(setup.dataDir, 'calendar.vault'), ELECTRON_CIPHER)
  const service = await CalendarService.load({
    store: CalendarStore.inDir(setup.dataDir, vault),
    now: () => Date.now(),
    onState: (state) => broadcast('calendar:changed', state),
    post: (item) => setup.inbox.post(item),
  })
  const { computer } = setup.connectors
  const reader = new CalendarAiReader({
    connectors: setup.connectors.calendar,
    computer: {
      holding: () => computer.holding,
      ready: () => computer.state().supported && !computer.state().needsPermissions,
    },
    claude: setup.claude,
    runners: setup.runners,
    dataDir: setup.dataDir,
    now: () => Date.now(),
    machineZone,
  })
  const sync = new CalendarSync(service, {
    direct: directReader(service, setup.connectors),
    ai: (source, signal) => reader.read(source, signal),
  })
  const stopped = computer.stopped
  const resumed = () => sync.resumed()

  computer.stopped = (key) => {
    stopped(key)
    reader.stop(key)
  }
  powerMonitor.on('resume', resumed)
  sync.start()

  return {
    service,
    sync,
    googleCalendars: (connectorId) => {
      const session = setup.connectors.calendar.google(connectorId, new AbortController().signal)

      return typeof session === 'string'
        ? Promise.resolve({ ok: false, failure: session })
        : listGoogleCalendars((url, request) => session.request(url, request))
    },
    shutdown: () => {
      powerMonitor.off('resume', resumed)
      sync.stop()
    },
  }
}
