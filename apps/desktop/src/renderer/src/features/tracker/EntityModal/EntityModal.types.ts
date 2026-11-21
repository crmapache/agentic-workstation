import type { TrackerEditor } from '../tracker.types'

/** Что правится: проект, поток или группа; текущие заголовки - у существующего. */
export type EntityModalProps = {
  editor: Extract<TrackerEditor, { kind: 'project' | 'flow' | 'group' }>
  title: string
  /** Подзаголовок потока и группы или описание проекта. */
  subtitle: string
  /** Создан новый проект: вид делает его открытой вкладкой. */
  onCreated: (id: string) => void
}
