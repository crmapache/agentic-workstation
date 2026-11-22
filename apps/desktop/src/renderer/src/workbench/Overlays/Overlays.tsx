import { ActionNotice } from '../ActionNotice/ActionNotice'
import { useExtensionEditor } from '../actions/extension-editor'
import { useExtensionKeys } from '../actions/extension-keys'
import { NotificationArea } from '../NotificationArea/NotificationArea'
import { SearchLayer } from '../SearchLayer/SearchLayer'
import { DiscardDialog } from '../../features/editor/DiscardDialog/DiscardDialog'
import { ExtensionDialog } from '../../features/extensions/ExtensionDialog/ExtensionDialog'
import { InboxToasts } from '../../features/inbox/InboxToasts/InboxToasts'
import { RemoteModal } from '../../features/remote/RemoteModal/RemoteModal'
import { ScenarioNotice } from '../../features/scenarios/ScenarioNotice/ScenarioNotice'
import { SettingsDialog } from '../../features/settings/SettingsDialog/SettingsDialog'
import { TasksNotice } from '../../features/tasks/TasksNotice/TasksNotice'
import { TrackerNotice } from '../../features/tracker/TrackerNotice/TrackerNotice'
import { UpdateNotice } from '../../features/updates/UpdateNotice/UpdateNotice'
import { VoiceHost } from '../../features/voice/VoiceHost/VoiceHost'

/**
 * Всё, что встаёт поверх раскладки окна: поиск везде, вопросы и окна (несохранённое, настройки,
 * Remote Control, вопросы расширений) и карточки в углу. Здесь же - клавиши команд, мост
 * редактора расширений (ADR 0091) и звук голосового звонка (ADR 0104): им нужен весь экран, а не
 * одна зона.
 */
export const Overlays = () => {
  useExtensionKeys()
  useExtensionEditor()

  return (
    <>
      <SearchLayer />
      <DiscardDialog />
      <SettingsDialog />
      <RemoteModal />
      <ExtensionDialog />
      <VoiceHost />

      <NotificationArea>
        <UpdateNotice />
        <ActionNotice />
        <ScenarioNotice />
        <TasksNotice />
        <TrackerNotice />
        <InboxToasts />
      </NotificationArea>
    </>
  )
}
