import { useAsideThread } from '../aside.queries'
import { useComposerStore } from '../composer.store'
import { ComposerQuotes } from '../ComposerQuotes/ComposerQuotes'
import { ConversationBlocked } from '../ConversationBlocked/ConversationBlocked'
import { ModDock } from '../ModDock/ModDock'
import { PermissionPrompt } from '../PermissionPrompt/PermissionPrompt'
import { QuestionPrompt } from '../QuestionPrompt/QuestionPrompt'
import { QueueList } from '../QueueList/QueueList'
import { SideQuestion } from '../SideQuestion/SideQuestion'
import { TaskListPanel } from '../TaskListPanel/TaskListPanel'
import styles from './ConversationDock.module.scss'
import type { ConversationDockProps } from './ConversationDock.types'

/**
 * Всё, что ждёт человека, - над полем ввода, в порядке ACC: вопрос CLI (разрешение,
 * выбор), список задач модели, моды CLI, вопросы сбоку (/btw), очередь, цитаты для
 * следующего сообщения; причина, по
 * которой разговор стоит, - последней, у самого поля. На низкой панели док отдаёт
 * высоту и прокручивается сам, поле и его кнопки остаются видны.
 */
export const ConversationDock = ({ project, conversation, tasks }: ConversationDockProps) => {
  const { pending, error } = conversation
  const hasQuotes = useComposerStore(
    (store) => (store.drafts[conversation.id]?.quotes.length ?? 0) > 0,
  )
  const isEditingQueued = useComposerStore(
    (store) => store.queueEdits[conversation.id] !== undefined,
  )
  // Закрытый список уходит сразу, как в ACC: трекер CLI держит его до конца сессии, и иначе
  // сделанное вчера вставало бы над полем на каждом следующем ходе.
  const showTasks = tasks.some((task) => task.state !== 'completed')
  const showQueue =
    conversation.queue.length > 0 || (isEditingQueued && conversation.status !== 'idle')
  // Моды и вопросы сбоку - после задач и перед очередью, ближе всех к полю (как в ACC).
  const isAsideOpen = useAsideThread(conversation.id).open
  const hasExtras = isAsideOpen || conversation.mods !== undefined

  if (!pending && !error && !showTasks && !showQueue && !hasQuotes && !hasExtras) return null

  return (
    <div className={styles.conversationDock}>
      {pending?.kind === 'permission' && (
        <PermissionPrompt key={pending.requestId} conversation={conversation} request={pending} />
      )}
      {pending?.kind === 'question' && (
        <QuestionPrompt
          key={pending.requestId}
          projectId={project.id}
          conversation={conversation}
          request={pending}
        />
      )}
      {showTasks && <TaskListPanel tasks={tasks} />}
      <ModDock mods={conversation.mods} />
      {isAsideOpen && <SideQuestion conversation={conversation} />}
      {showQueue && <QueueList conversation={conversation} />}
      {hasQuotes && <ComposerQuotes draftKey={conversation.id} />}
      {error && <ConversationBlocked project={project} conversation={conversation} error={error} />}
    </div>
  )
}
