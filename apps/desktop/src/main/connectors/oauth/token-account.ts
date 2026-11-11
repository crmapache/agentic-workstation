const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Чей вход, по ответу сервера с токеном: Notion называет рабочее пространство
 * (workspace_name), Slack - команду (team.name). Остальные не говорят - null.
 */
export const accountFromTokenResponse = (body: unknown): string | null => {
  if (!isRecord(body) || typeof body['access_token'] !== 'string') return null

  if (typeof body['workspace_name'] === 'string') return body['workspace_name']

  const team = body['team']

  return isRecord(team) && typeof team['name'] === 'string' ? team['name'] : null
}

/**
 * fetch, который подсматривает ответы с токеном: SDK разбирает их по своей схеме и
 * лишнее (имя пространства) выбрасывает. Ответ отдаётся SDK нетронутым - читается копия.
 */
export const capturingFetch = (onAccount: (account: string) => void): typeof fetch => {
  return async (input, init) => {
    const response = await fetch(input, init)
    const isJson = response.headers.get('content-type')?.includes('json') ?? false

    if (response.ok && isJson) {
      const account = accountFromTokenResponse(
        await response
          .clone()
          .json()
          .catch(() => null),
      )

      if (account) onAccount(account)
    }

    return response
  }
}
