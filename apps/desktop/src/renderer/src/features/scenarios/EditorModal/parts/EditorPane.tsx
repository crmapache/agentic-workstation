import type { EditorPaneProps } from '../EditorModal.types'
import { withStage, movedStage } from '../../scenarios-editor.utils'
import { HeadPane } from './HeadPane'
import { InputsPane } from './InputsPane'
import { NamePane } from './NamePane'
import { StagePane } from './StagePane'

/** Правая часть редактора - та часть сценария, на которой стоит оглавление. */
export const EditorPane = ({ draft, at, canShare, onChange, onRemoveStage }: EditorPaneProps) => {
  if (at.part === 'name') return <NamePane draft={draft} canShare={canShare} onChange={onChange} />

  if (at.part === 'head')
    return (
      <HeadPane
        head={draft.head}
        onHead={(patch) => onChange((one) => ({ ...one, head: { ...one.head, ...patch } }))}
      />
    )

  if (at.part === 'inputs')
    return (
      <InputsPane
        inputs={draft.inputs}
        onInputs={(change) => onChange((one) => ({ ...one, inputs: change(one.inputs) }))}
      />
    )

  const index = draft.stages.findIndex((stage) => stage.id === at.stageId)
  const stage = draft.stages[index]

  if (!stage) return null

  return (
    <StagePane
      stage={stage}
      number={index + 1}
      total={draft.stages.length}
      openCard={at.cardId}
      onStage={(change) => onChange((one) => withStage(one, stage.id, change))}
      onMove={(by) => onChange((one) => movedStage(one, stage.id, by))}
      onRemove={() => onRemoveStage(stage.id)}
    />
  )
}
