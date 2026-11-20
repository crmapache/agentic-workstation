import { Aperture, MoonStar, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CallLight } from '@agentic-workstation/ui/CallLight'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Свет позвавшего (CallLight): иконки полосы провайдеров, где разговор позвал человека, - по
 * поводу каждого тона, и голый свет в квадрате, как его видит любой хозяин.
 */
export const CallLightSpecimen = () => {
  const { t } = useTranslation('showcase')

  return (
    <Specimen label={t('specimens.callLight')}>
      <IconButton icon={Sparkles} label={t('samples.callDone')} call="success" callSince={0} />
      <IconButton icon={Aperture} label={t('samples.callAsks')} call="attention" callSince={1600} />
      <IconButton icon={MoonStar} label={t('samples.callFailed')} call="danger" callSince={3200} />
      <span className={styles.callLightSample}>
        <CallLight call="attention" since={800} />
      </span>
      <span className={styles.callLightSample}>
        <CallLight call="success" since={2400} calm />
      </span>
    </Specimen>
  )
}
