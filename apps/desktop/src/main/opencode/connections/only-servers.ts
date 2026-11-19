import type { GatewayLaunch } from '../../connectors/gateway/launches'

/**
 * Ключ шлюза процесса с частью серверов: разовому вопросу - только те, чьи инструменты ему
 * разрешены, остальных процесс не увидит вовсе (servers пусто - коннекторов нет, ключ сразу
 * отзывается). servers нет - все серверы проекта.
 */
export const onlyServers = (
  launch: GatewayLaunch | null,
  servers: readonly string[] | undefined,
): GatewayLaunch | null => {
  if (!launch || servers === undefined) return launch

  const kept = launch.servers.filter((server) => servers.includes(server.name))

  if (kept.length > 0) return { ...launch, servers: kept }

  launch.release()

  return null
}
