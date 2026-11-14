import type { ConnectorInProject } from '@shared/connectors'

/**
 * Настройки коннектора по проектам после того, что человек сказал о проекте path (ADR 0053):
 * пустые стирают запись - хранить «ничего» незачем. null - ничего не меняется, и тогда ни
 * записи на диск, ни переподключения сервера у живых разговоров.
 */
export const withInProject = (
  inProjects: Readonly<Record<string, ConnectorInProject>>,
  path: string,
  settings: ConnectorInProject,
): Record<string, ConnectorInProject> | null => {
  const { [path]: before, ...others } = inProjects
  const isEmpty = !settings.instructions && !settings.browserProfile

  if (!before) return isEmpty ? null : { ...others, [path]: settings }

  const isSame =
    before.instructions === settings.instructions &&
    before.browserProfile === settings.browserProfile

  if (isSame) return null

  return isEmpty ? others : { ...others, [path]: settings }
}
