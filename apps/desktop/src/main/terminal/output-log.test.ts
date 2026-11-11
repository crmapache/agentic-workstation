import { it, expect, describe } from 'vitest'

import { OutputLog } from './output-log'
import { REPLAY_SLACK } from './terminal.constants'

describe('OutputLog', () => {
  it('считает весь вывод и отдаёт его хвостом', () => {
    const log = new OutputLog(100)

    log.append('ab')
    log.append('cd')
    expect(log.snapshot()).toEqual({ data: 'abcd', end: 4 })
  })

  it('перерос предел - режет до него, с начала строки', () => {
    const log = new OutputLog(10)
    const line = 'line\n'

    while (log.end <= 10 * REPLAY_SLACK) log.append(line)

    const { data, end } = log.snapshot()

    expect(end).toBe(15)
    expect(data).toBe('line\nline\n')
  })
})
