import { Copy, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useCopied } from '@agentic-workstation/ui/CodeSnippet.hooks'
import { IconButton } from '@agentic-workstation/ui/IconButton'

/**
 * Копия блока ответа (код, цитата) под палец. Наведения на телефоне нет, поэтому кнопка видна
 * всегда; после нажатия - галочка на пару мгновений: в буфер не заглянуть, а так видно, что
 * сработало.
 */
export const CopyButton = ({ text }: { text: string }) => {
  const { t } = useTranslation()
  const { isCopied, copy } = useCopied()

  return (
    <IconButton
      icon={isCopied ? Check : Copy}
      size="touch"
      label={isCopied ? t('markdown.copied') : t('markdown.copy')}
      onClick={() => copy(text)}
    />
  )
}
