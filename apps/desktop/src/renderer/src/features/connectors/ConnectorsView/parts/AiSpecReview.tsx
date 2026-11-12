import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import { ACCESS_TONES } from '../ConnectorsView.constants'
import { useAiSpecAdd } from '../ConnectorsView.hooks'
import styles from '../ConnectorsView.module.scss'
import type { AiSpecReviewProps } from '../ConnectorsView.types'
import { hostOf, isForeignHost } from '../ConnectorsView.utils'
import { TypeNameFields } from './TypeNameFields'

/**
 * Проверка описания от ИИ до добавления: на какой хост ходит (крупно - туда уйдёт ключ),
 * как входит и какие инструменты с какой ступенью доступа. Здесь же имя своего типа (по
 * умолчанию - сервис), «несколько раз» и ключ: ключа ИИ не видит. Поправить описание -
 * словами ИИ в разговоре рядом.
 */
export const AiSpecReview = ({ proposal, request, onAdded }: AiSpecReviewProps) => {
  const { t } = useTranslation()
  const { spec, dropped } = proposal
  const form = useAiSpecAdd(spec, onAdded)
  const { auth } = spec
  const name = auth.type === 'header' || auth.type === 'query' ? auth.name : ''
  const host = hostOf(spec.baseUrl)

  return (
    <div className={styles.form}>
      <p className={styles.host}>
        {t('connectors.ai.host')} <span className={styles.hostName}>{host}</span>
      </p>
      {isForeignHost(spec.baseUrl, request.docsUrl) && (
        <p className={styles.warning}>
          {t('connectors.ai.foreignHost', { docs: hostOf(request.docsUrl) })}
        </p>
      )}
      <p className={styles.hint}>
        {[spec.service, spec.baseUrl, t(`connectors.ai.auth.${auth.type}`, { name })].join(' · ')}
      </p>
      <ul className={styles.specTools}>
        {spec.tools.map((tool) => (
          <li key={tool.name} className={styles.specTool}>
            <Badge tone={ACCESS_TONES[tool.access]} variant="soft">
              {t(`connectors.tools.groups.${tool.access}`)}
            </Badge>
            <span className={styles.specName}>{tool.name}</span>
            <span className={styles.specPath}>
              {tool.method} {tool.path}
            </span>
          </li>
        ))}
      </ul>
      {dropped.length > 0 && (
        <p className={styles.warning}>
          {t('connectors.ai.dropped', {
            count: dropped.length,
            names: dropped.join(', '),
          })}
        </p>
      )}
      <TypeNameFields
        values={form.type}
        autoFocus={false}
        onChange={form.setType}
        onKeyDown={form.handleKeyDown}
      />
      {auth.type === 'basic' && (
        <TextField
          label={t('connectors.ai.username')}
          value={form.username}
          onChange={form.setUsername}
          onKeyDown={form.handleKeyDown}
        />
      )}
      {auth.type !== 'none' && (
        <>
          <TextField
            label={t(auth.type === 'basic' ? 'connectors.ai.password' : 'connectors.ai.key')}
            type="password"
            value={form.secret}
            onChange={form.setSecret}
            onKeyDown={form.handleKeyDown}
          />
          <p className={styles.hint}>{spec.authHelp}</p>
        </>
      )}
      {form.error && <p className={styles.failure}>{t(`connectors.add.errors.${form.error}`)}</p>}
      <div className={styles.formActions}>
        <Button size="sm" variant="primary" icon={Plus} disabled={form.isBusy} onClick={form.add}>
          {t('connectors.ai.add')}
        </Button>
      </div>
    </div>
  )
}
