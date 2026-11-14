import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

/**
 * Окно IDE глазами агента: снимок экрана и выполнение выражения в странице через
 * Chrome DevTools Protocol. Без Playwright и без зависимостей - WebSocket есть в Node.
 *
 * Окно должно быть запущено с открытым портом отладки:
 *   dev:        AGENTIC_WORKSTATION_CDP_PORT=5316 pnpm dev
 *   собранное:  "/Applications/Agentic Workstation.app/Contents/MacOS/Agentic Workstation" --remote-debugging-port=5316
 *
 * Команды:
 *   node scripts/cdp.mjs screenshot [файл.png]     снимок окна (по умолчанию .screenshots/window.png)
 *   node scripts/cdp.mjs eval "<выражение>"        результат выражения в странице, JSON
 *   node scripts/cdp.mjs click "<css-селектор>"    клик мышью в центр элемента
 *   node scripts/cdp.mjs click-at <x> <y>          клик мышью в точку окна (CSS-пиксели)
 *   node scripts/cdp.mjs hover "<css-селектор>"    навести мышь на центр элемента
 *   node scripts/cdp.mjs type "<текст>"            напечатать текст в элемент с фокусом
 *   node scripts/cdp.mjs key <клавиша> [meta+shift] нажать и отпустить: Enter, ArrowDown,
 *                                                  Shift, KeyF (по физической клавише)
 *
 * Клик - настоящее нажатие мыши (Input.dispatchMouseEvent), а не element.click(): так
 * срабатывает всё, что срабатывает у человека, - закрытие панели по клику мимо, hover,
 * фокус. Невидимый элемент кликнуть нельзя, как и человеку. Но систему он обходит:
 * нажатие по шапке, за которую таскают окно, тут дойдёт до страницы, а у человека нет.
 */

const port = process.env.AGENTIC_WORKSTATION_CDP_PORT ?? '5316'
const [command, argument] = process.argv.slice(2)

const findPageSocketUrl = async () => {
  const response = await fetch(`http://127.0.0.1:${port}/json`)
  const targets = await response.json()
  // Страниц у IDE две: главное окно и капсула Computer Use (ADR 0057). Скрипт смотрит на окно.
  const page = targets.find(
    (target) => target.type === 'page' && !target.url.includes('capsule.html'),
  )

  if (!page) throw new Error(`На порту ${port} нет страницы. Окно запущено с отладкой?`)

  return page.webSocketDebuggerUrl
}

const connect = async () => {
  const socket = new WebSocket(await findPageSocketUrl())
  const pending = new Map()
  let nextId = 1

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    const request = pending.get(message.id)

    if (!request) return

    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', rejectOpen, { once: true })
  })

  const send = (method, params = {}) =>
    new Promise((resolveSend, rejectSend) => {
      const id = nextId++

      pending.set(id, { resolve: resolveSend, reject: rejectSend })
      socket.send(JSON.stringify({ id, method, params }))
    })

  return { send, close: () => socket.close() }
}

const evaluate = async (send, expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })

  if (exceptionDetails)
    throw new Error(exceptionDetails.exception?.description ?? 'ошибка в странице')

  return result.value
}

const clickAt = async (send, x, y) => {
  const point = { x, y, button: 'left', clickCount: 1 }

  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', { ...point, type: 'mousePressed', buttons: 1 })
  await send('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased', buttons: 0 })
}

/** Клавиши, которым нужен код Windows: без него браузер не делает действие по умолчанию. */
const KEY_CODES = {
  Enter: 13,
  Tab: 9,
  Escape: 27,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Shift: 16,
}

const MODIFIER_BITS = { alt: 1, ctrl: 2, meta: 4, shift: 8 }

/** Нажать и отпустить клавишу. KeyF - буква по физической клавише, как event.code. */
const pressKey = async (send, name, modifierList = '') => {
  const modifiers = modifierList
    .split('+')
    .filter(Boolean)
    .reduce((bits, modifier) => bits | (MODIFIER_BITS[modifier] ?? 0), 0)
  const isLetter = /^Key[A-Z]$/.test(name)
  // F1-F12: код клавиши Windows - 112 и дальше по порядку.
  const functionKey = /^F([1-9]|1[0-2])$/.exec(name)
  const key = isLetter ? name.slice(3).toLowerCase() : name
  const code = name === 'Shift' ? 'ShiftLeft' : name
  const virtual = isLetter
    ? name.charCodeAt(3)
    : functionKey
      ? 111 + Number(functionKey[1])
      : KEY_CODES[name]
  const event = {
    key,
    code,
    modifiers,
    windowsVirtualKeyCode: virtual,
    nativeVirtualKeyCode: virtual,
  }

  await send('Input.dispatchKeyEvent', { ...event, type: 'rawKeyDown' })
  await send('Input.dispatchKeyEvent', { ...event, type: 'keyUp' })
}

const { send, close } = await connect()

try {
  if (command === 'screenshot') {
    const file = resolve(argument ?? '.screenshots/window.png')
    const { data } = await send('Page.captureScreenshot', { format: 'png' })

    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, Buffer.from(data, 'base64'))
    console.log(file)
  } else if (command === 'eval') {
    console.log(JSON.stringify(await evaluate(send, argument), null, 2))
  } else if (command === 'click' || command === 'hover') {
    const selector = JSON.stringify(argument)
    const center = await evaluate(
      send,
      `(() => {
        const el = document.querySelector(${selector})
        if (!el) return 'missing'
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        const { x, y, width, height } = el.getBoundingClientRect()
        return width && height ? { x: x + width / 2, y: y + height / 2 } : 'hidden'
      })()`,
    )

    if (center === 'missing') throw new Error(`Не нашёл элемент ${argument}`)
    if (center === 'hidden') throw new Error(`Элемент ${argument} не виден`)
    if (command === 'hover') {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x, y: center.y })
    } else {
      await clickAt(send, center.x, center.y)
    }
    console.log('ok')
  } else if (command === 'type') {
    await send('Input.insertText', { text: argument ?? '' })
    console.log('ok')
  } else if (command === 'key') {
    await pressKey(send, argument ?? '', process.argv[4])
    console.log('ok')
  } else if (command === 'click-at') {
    const [x, y] = process.argv.slice(3).map(Number)

    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Нужны две координаты: x y')
    await clickAt(send, x, y)
    console.log('ok')
  } else {
    console.error(
      'Команды: screenshot | eval | click | click-at | hover | type | key - описание в начале файла',
    )
    process.exitCode = 1
  }
} finally {
  close()
}
