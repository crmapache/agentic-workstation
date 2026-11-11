import { it, expect, describe } from 'vitest'

import { KEPT_MS, CommandLedger } from './command-ledger'

describe('журнал команд телефона', () => {
  it('идущая команда не забывается, сколько бы ни шла; итог помнится KEPT_MS после себя', () => {
    let now = 0
    const ledger = new CommandLedger(() => now)

    ledger.begin('P', 'aside')
    now = KEPT_MS * 2
    ledger.sweep()
    expect(ledger.seen('P', 'aside')).toEqual({ at: 0, outcome: null })

    ledger.settle('P', 'aside', { ok: true, data: 'answer' })
    now += KEPT_MS
    ledger.sweep()
    expect(ledger.seen('P', 'aside')?.outcome).toEqual({ ok: true, data: 'answer' })

    now += 1
    expect(ledger.seen('P', 'aside')).toBeNull()
  })
})
