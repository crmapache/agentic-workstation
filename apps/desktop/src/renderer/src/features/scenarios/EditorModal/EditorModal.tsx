import { Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { problemsOf } from '@shared/scenario-rules'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'

import { ScenarioConfirm } from '../ScenarioConfirm/ScenarioConfirm'
import { useEditorDraft } from './EditorModal.hooks'
import styles from './EditorModal.module.scss'
import type { EditorModalProps } from './EditorModal.types'
import { editorSubtitle } from './EditorModal.utils'
import { EditorFooter } from './parts/EditorFooter'
import { EditorOutline } from './parts/EditorOutline'
import { EditorPane } from './parts/EditorPane'

/**
 * Редактор сценария (ScenarioEditor в ACC) - большим окном по центру (ADR 0030): слева
 * оглавление с находками, справа только правимая часть. Черновик - в сторе вида, окно его
 * переживает уход с вида. Пока окно спрашивает «выбросить?», само оно закрыто: Esc нативного
 * окна уже закрыл его, и «нет» открывает его заново тем же черновиком.
 */
export const EditorModal = (props: EditorModalProps) => {
  const { t } = useTranslation()
  const editor = useEditorDraft(props)
  const { draft, at } = editor
  const problems = problemsOf(draft)
  const title = draft.name.trim() || t('scenarios.editor.untitled')

  return (
    <>
      <Modal
        open={!editor.asking}
        size="lg"
        icon={Workflow}
        title={title}
        description={editorSubtitle(t, draft, editor.fresh)}
        headerActions={
          <HelpButton
            label={t('scenarios.editor.help.label')}
            title={t('scenarios.editor.help.title')}
            text={t('scenarios.editor.help.text')}
            closeLabel={t('common.close')}
          />
        }
        footer={
          <EditorFooter
            problems={problems}
            fresh={editor.fresh}
            saving={editor.saving}
            refusal={editor.refusal ? t(`scenarios.codes.${editor.refusal}`) : ''}
            onCancel={editor.leave}
            onSave={editor.save}
          />
        }
        closeLabel={t('common.close')}
        onClose={editor.leave}>
        <div className={styles.body}>
          <EditorOutline
            draft={draft}
            at={at}
            problems={problems}
            onPlace={editor.place}
            onAddStage={editor.addStage}
          />
          <div key={at.part === 'stage' ? at.stageId : at.part} className={styles.pane}>
            <EditorPane
              draft={draft}
              at={at}
              canShare={editor.canShare}
              onChange={editor.change}
              onRemoveStage={editor.removeStage}
            />
          </div>
        </div>
      </Modal>
      <ScenarioConfirm
        open={editor.asking}
        title={
          editor.fresh
            ? t('scenarios.editor.confirmDiscard.titleNew')
            : t('scenarios.editor.confirmDiscard.title')
        }
        subject={title}
        note={
          editor.fresh
            ? t('scenarios.editor.confirmDiscard.noteNew')
            : t('scenarios.editor.confirmDiscard.note')
        }
        submit={t('scenarios.editor.confirmDiscard.submit')}
        onSubmit={editor.discard}
        onClose={editor.stay}
      />
    </>
  )
}
