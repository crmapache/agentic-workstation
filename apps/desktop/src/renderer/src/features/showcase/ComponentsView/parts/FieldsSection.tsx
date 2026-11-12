import { useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CodeSnippet } from '@agentic-workstation/ui/CodeSnippet'
import { ProgressBar } from '@agentic-workstation/ui/ProgressBar'
import { Spinner } from '@agentic-workstation/ui/Spinner'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import { PROGRESS_SAMPLES } from '../ComponentsView.constants'
import styles from '../ComponentsView.module.scss'
import { ShowcaseSection } from '../../ShowcaseSection/ShowcaseSection'
import { Specimen } from '../../Specimen/Specimen'
import { SearchListSpecimen } from './SearchListSpecimen'
import { SelectFieldSpecimen } from './SelectFieldSpecimen'

/**
 * Раздел «Поля и прогресс»: поле с иконкой, поле с ошибкой, недоступное, многострочное, поле
 * выбора, список поиска под полем, строка кода с копией, полосы прогресса, знак работы без доли - и он же
 * кольцом вокруг номера, как у текущей остановки дороги сценария.
 */
export const FieldsSection = () => {
  const { t } = useTranslation('showcase')
  const [query, setQuery] = useState('')
  const [branch, setBranch] = useState('main')
  const [note, setNote] = useState('')

  return (
    <ShowcaseSection title={t('sections.fields')}>
      <Specimen label={t('specimens.textField')} layout="column">
        <TextField
          label={t('samples.search')}
          hideLabel
          icon={Search}
          placeholder={t('samples.searchPlaceholder')}
          value={query}
          onChange={setQuery}
        />
        <TextField
          label={t('samples.fieldLabel')}
          placeholder={t('samples.fieldPlaceholder')}
          value=""
          disabled
          onChange={() => undefined}
        />
      </Specimen>

      <Specimen label={t('specimens.textFieldError')} layout="column">
        <TextField
          label={t('samples.fieldLabel')}
          value={branch}
          error={t('samples.fieldError')}
          onChange={setBranch}
        />
      </Specimen>

      <Specimen label={t('specimens.textArea')} layout="column">
        <TextArea
          label={t('samples.noteLabel')}
          placeholder={t('samples.notePlaceholder')}
          value={note}
          onChange={setNote}
        />
        <TextArea
          label={t('samples.noteLabel')}
          value={t('samples.noteSample')}
          error={t('samples.noteError')}
          onChange={() => undefined}
        />
        <TextArea
          label={t('samples.noteLabel')}
          value={t('samples.noteSample')}
          disabled
          onChange={() => undefined}
        />
      </Specimen>

      <SelectFieldSpecimen />

      <SearchListSpecimen />

      <Specimen label={t('specimens.codeSnippet')} layout="column">
        <CodeSnippet
          code={t('samples.snippetShort')}
          copyLabel={t('samples.copy')}
          copiedLabel={t('samples.copied')}
        />
        <CodeSnippet
          code={t('samples.snippetLong')}
          copyLabel={t('samples.copy')}
          copiedLabel={t('samples.copied')}
        />
      </Specimen>

      <Specimen label={t('specimens.progress')} layout="column">
        {PROGRESS_SAMPLES.map(({ value, tone }) => (
          <ProgressBar key={value} value={value} tone={tone} label={t('samples.progressLabel')} />
        ))}
        <ProgressBar label={t('samples.progressLabel')} />
      </Specimen>

      <Specimen label={t('specimens.spinner')}>
        <Spinner label={t('samples.spinnerLabel')} />
        <Spinner size="md" label={t('samples.spinnerLabel')} />
        <Spinner tone="neutral" label={t('samples.spinnerLabel')} />
        <Spinner size="md" tone="neutral" label={t('samples.spinnerLabel')} />
        <Spinner tone="warning" label={t('samples.spinnerLabel')} />
        <Spinner size="md" tone="warning" label={t('samples.spinnerLabel')} />
        <span className={styles.spinnerSign}>
          {t('samples.spinnerStop')}
          <span className={styles.spinnerAround}>
            <Spinner size="around" tone="warning" label={t('samples.spinnerLabel')} />
          </span>
        </span>
      </Specimen>
    </ShowcaseSection>
  )
}
