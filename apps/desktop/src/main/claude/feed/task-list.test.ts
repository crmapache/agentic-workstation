import { it, expect, describe } from 'vitest'

import { TaskList } from './task-list'

/** Задача через TaskCreate: вызов, потом результат с её номером, как у CLI. */
const create = (list: TaskList, id: string, subject: string) => {
  list.applyToolUse(`use-${id}`, 'TaskCreate', { subject, activeForm: subject })
  list.applyToolResult(`use-${id}`, undefined, `Task #${id} created successfully: ${subject}`)
}

const complete = (list: TaskList, id: string) =>
  list.applyToolUse(`done-${id}`, 'TaskUpdate', { taskId: id, status: 'completed' })

const subjects = (list: TaskList) => list.tasks.map((task) => `${task.id}:${task.state}`)

describe('TaskList', () => {
  it('TaskCreate добавляет задачу с номером из результата, TaskUpdate закрывает её', () => {
    const list = new TaskList()

    create(list, '1', 'Read')
    create(list, '2', 'Edit')
    complete(list, '1')

    expect(subjects(list)).toEqual(['1:completed', '2:pending'])
  })

  it('после сообщения человека первая новая задача начинает список заново', () => {
    const list = new TaskList()

    create(list, '1', 'Read')
    create(list, '2', 'Edit')
    complete(list, '1')
    complete(list, '2')
    list.markCarried()

    expect(subjects(list)).toEqual(['1:completed', '2:completed'])

    // Номера у трекера CLI идут дальше: 3 и 4 - уже следующий запрос.
    create(list, '3', 'Plan')
    create(list, '4', 'Build')

    expect(subjects(list)).toEqual(['3:pending', '4:pending'])
  })

  it('агент тронул прежнюю задачу после «+» - список тот же, новая к нему добавляется', () => {
    const list = new TaskList()

    create(list, '1', 'Read')
    create(list, '2', 'Edit')
    complete(list, '1')
    list.markCarried()
    complete(list, '2')
    create(list, '3', 'Test')

    expect(subjects(list)).toEqual(['1:completed', '2:completed', '3:pending'])
  })

  it('пустой список пометка не трогает, TodoWrite заменяет помеченный целиком', () => {
    const list = new TaskList()

    list.markCarried()
    create(list, '1', 'Read')
    list.markCarried()
    list.applyToolUse('todo', 'TodoWrite', {
      todos: [{ content: 'Ship', activeForm: 'Shipping', status: 'in_progress' }],
    })
    create(list, '2', 'Check')

    expect(subjects(list)).toEqual(['1:in_progress', '2:pending'])
  })

  it('откат к сообщению снимает пометку: список - каким был до него', () => {
    const list = new TaskList()

    create(list, '1', 'Read')
    const before = list.tasks

    list.markCarried()
    list.restore(before)
    create(list, '2', 'Edit')

    expect(subjects(list)).toEqual(['1:pending', '2:pending'])
  })
})
