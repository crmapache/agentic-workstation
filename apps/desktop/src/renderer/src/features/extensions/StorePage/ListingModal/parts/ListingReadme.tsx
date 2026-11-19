import { Suspense } from 'react'

import styles from '../ListingModal.module.scss'
import type { ListingPartProps } from '../ListingModal.types'
import { useConversationLog } from '../../../../../state/conversation-log.context'

/** README расширения - тем же разбором Markdown, что ответы в ленте; без него - текстом. */
export const ListingReadme = ({ view }: ListingPartProps) => {
  const log = useConversationLog()
  const text = view.listing.readme || view.listing.description
  const plain = <p className={styles.plain}>{text}</p>

  return (
    <div className={styles.readme}>
      {log ? (
        <Suspense fallback={plain}>
          <log.Text text={text} />
        </Suspense>
      ) : (
        plain
      )}
    </div>
  )
}
