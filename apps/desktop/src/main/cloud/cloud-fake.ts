import type {
  PulledRecord,
  PullResponse,
  PushResponse,
} from '@agentic-workstation/cloud-protocol/api'

import type { CloudTransport } from './cloud-client'

/**
 * Облако в памяти для проверок: те же правила, что у сервера (запись принимается только на ту
 * версию, что лежит на сервере), без сети и без ожидания. page - размер страницы забора.
 */
export class FakeCloud {
  rev = 0
  readonly records = new Map<string, PulledRecord>()
  /** Сколько раз сервер отказал записи из-за версии. */
  disputes = 0

  constructor(private readonly page = 500) {}

  transport(): CloudTransport {
    return {
      push: (records) => {
        const results: PushResponse['results'] = records.map((record) => {
          const current = this.records.get(record.id)?.rev ?? 0

          if (record.baseRev !== current) {
            this.disputes += 1

            return { id: record.id, ok: false, current }
          }

          this.rev += 1
          this.records.set(record.id, { id: record.id, rev: this.rev, blob: record.blob })

          return { id: record.id, ok: true, rev: this.rev }
        })

        return Promise.resolve({ rev: this.rev, results })
      },
      pull: (since) => {
        const newer = [...this.records.values()]
          .filter((record) => record.rev > since)
          .sort((a, b) => a.rev - b.rev)
        const reply: PullResponse = {
          rev: this.rev,
          records: newer.slice(0, this.page),
          more: newer.length > this.page,
        }

        return Promise.resolve(reply)
      },
    }
  }
}
