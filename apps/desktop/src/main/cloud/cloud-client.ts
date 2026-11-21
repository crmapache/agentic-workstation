import type { CloudFailure } from '@shared/tracker'

import type {
  PushRecord,
  PullResponse,
  PushResponse,
  CloudErrorCode,
} from '@agentic-workstation/cloud-protocol/api'
import type { CloudAccount } from '@agentic-workstation/cloud-protocol/node-account'
import { signedHeaders } from '@agentic-workstation/cloud-protocol/node-signer'

/** Разговор с облаком: записать пачку и забрать новое. Подделка в тестах - без сети. */
export type CloudTransport = {
  push: (records: PushRecord[]) => Promise<PushResponse>
  pull: (since: number, wait: number, signal?: AbortSignal) => Promise<PullResponse>
}

/** Сбой облака: offline - сети нет или сервер не ответил, остальное - код для окна. */
export class CloudFault extends Error {
  constructor(readonly failure: CloudFailure | 'offline') {
    super(failure)
  }
}

const PUSH_TIMEOUT_MS = 30_000
/** Забор с ожиданием держится сервером до wait секунд - запас сверху на сеть. */
const PULL_EXTRA_MS = 15_000

const failureOf = (code: CloudErrorCode | undefined, status: number): CloudFailure | 'offline' => {
  if (code === 'unsigned' || code === 'bad-signature' || status === 401) return 'rejected'
  if (code === 'account-full' || status === 507) return 'accountFull'
  if (status >= 500 || status === 429) return 'offline'

  return 'server'
}

/**
 * Облако по HTTPS: каждый запрос подписан ключом аккаунта (ADR 0102). Ответы не проверяются
 * схемой целиком - движок синхронизации сам пропускает запись, которая не открылась шифром.
 */
export const httpTransport = (baseUrl: string, account: CloudAccount): CloudTransport => {
  const request = async <T>(
    method: 'GET' | 'POST',
    path: string,
    body: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<T> => {
    const timeout = AbortSignal.timeout(timeoutMs)
    let response: Response

    try {
      response = await fetch(new URL(path, baseUrl), {
        method,
        headers: {
          ...signedHeaders(account, { method, path, body }),
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body } : {}),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
    } catch (error) {
      if (signal?.aborted) throw error

      throw new CloudFault('offline')
    }

    const text = await response.text().catch(() => '')

    if (!response.ok) {
      let code: CloudErrorCode | undefined

      try {
        code = (JSON.parse(text) as { error?: CloudErrorCode }).error
      } catch {
        code = undefined
      }

      console.warn('[cloud] отказ сервера', response.status, code ?? '')
      throw new CloudFault(failureOf(code, response.status))
    }

    try {
      return JSON.parse(text) as T
    } catch {
      throw new CloudFault('badReply')
    }
  }

  return {
    push: (records) =>
      request<PushResponse>('POST', '/v1/push', JSON.stringify({ records }), PUSH_TIMEOUT_MS),
    pull: (since, wait, signal) =>
      request<PullResponse>(
        'GET',
        `/v1/pull?since=${since}&wait=${wait}`,
        '',
        wait * 1000 + PULL_EXTRA_MS,
        signal,
      ),
  }
}
