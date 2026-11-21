import type { TrackerBook } from './tracker-book'
import { flagOf, isAlive, stampsOf } from './tracker-records'
import { TrackerTree } from './tracker-tree'

/**
 * Сироты после встречных правок двух машин: одна удалила группу (задачу, поток), другая в это
 * время положила в неё карточку. Каскад первой этой карточки не знал, и живая запись осталась под
 * удалённым предком - невидимой нигде. Правило одно на всех машинах: правка новее удаления
 * возвращает предков (новая работа побеждает), старше - уходит вслед за ними.
 */
export const healOrphans = (book: TrackerBook): boolean => {
  const tree = new TrackerTree(book.records())
  let changed = false

  for (const record of book.records()) {
    if (record.kind === 'space' || !isAlive(record)) continue

    const line = tree.ancestors(record.id)
    const dead = line.filter((one) => flagOf(one, 'deleted') && one.kind !== 'space')
    const nearest = dead[0]

    if (!nearest) continue

    const touched = stampsOf(record).reduce((last, stamp) => (stamp > last ? stamp : last), '')
    const removed = nearest.fields.deleted?.[1] ?? ''

    if (touched > removed) {
      for (const ancestor of dead) book.write(ancestor.id, { deleted: false }, true)
    } else {
      book.write(record.id, { deleted: true }, true)
    }

    changed = true
  }

  if (changed) book.commit()

  return changed
}
