import { it, expect, describe } from 'vitest'

import { knownFiles, splitLinks, splitPaths, readPathRef, isOpenablePath } from './paths.utils'

/** Запрос файла (не папки) - как его вернёт readPathRef. */
const file = (path: string, place: object = {}) => ({
  request: { path, ...place },
  folder: false,
})

const folder = (path: string) => ({ request: { path }, folder: true })

/** Тексты кусков-путей: что стало ссылкой. */
const linked = (text: string, known = knownFiles([])) =>
  splitPaths(text, known)
    .filter((chunk) => chunk.kind === 'path')
    .map((chunk) => chunk.text)

/**
 * Что сделает нажатие на кусок ответа, решает только это правило: путь открывается,
 * остальное - нет. Ошибки в обе стороны одинаково плохи: версия-ссылка обещает
 * редактор и ничего не открывает, путь простым текстом заставляет перепечатывать.
 */
describe('путь в ответе', () => {
  it('простой путь', () => {
    expect(readPathRef('webview/src/App.tsx')).toEqual(file('webview/src/App.tsx'))
  })

  it('строка после пути', () => {
    expect(readPathRef('webview/src/App.tsx:3262')).toEqual(
      file('webview/src/App.tsx', { line: 3262 }),
    )
  })

  // Написавший колонку имел в виду именно тот символ.
  it('колонка после строки', () => {
    expect(readPathRef('src/main.kt:120:4')).toEqual(file('src/main.kt', { line: 120, column: 4 }))
  })

  // Диапазон - кусок файла, его просят показать целиком: редактор его выделит.
  it('диапазон колонок - целиком', () => {
    expect(readPathRef('src/useSocket.js:15:33-40')).toEqual(
      file('src/useSocket.js', { line: 15, column: 33, endColumn: 40 }),
    )
  })

  it('диапазон строк - целиком', () => {
    expect(readPathRef('src/useSocket.js:15-20')).toEqual(
      file('src/useSocket.js', { line: 15, endLine: 20 }),
    )
  })

  it('диапазон строк с колонками на обоих концах', () => {
    expect(readPathRef('src/App.tsx:12-18:5-30')).toEqual(
      file('src/App.tsx', { line: 12, endLine: 18, column: 5, endColumn: 30 }),
    )
  })

  it('без колонки - без колонки, ноль - как не написано', () => {
    expect(readPathRef('src/main.kt:120')).toEqual(file('src/main.kt', { line: 120 }))
    expect(readPathRef('src/main.kt:0')).toEqual(file('src/main.kt'))
  })

  it('голое имя с известным расширением', () => {
    expect(readPathRef('CLAUDE.md')).toEqual(file('CLAUDE.md'))
  })

  it('имя с точки в начале', () => {
    expect(readPathRef('.gitignore')).toEqual(file('.gitignore'))
    expect(readPathRef('.env')).toEqual(file('.env'))
  })

  it('абсолютный путь и буква диска', () => {
    expect(readPathRef('/Users/max/notes.md')).toEqual(file('/Users/max/notes.md'))
    expect(readPathRef('C:\\project\\build.gradle.kts')).toEqual(
      file('C:\\project\\build.gradle.kts'),
    )
  })

  it('«@» упоминания и пунктуация фразы - не часть пути', () => {
    expect(readPathRef('@relay/README.md')).toEqual(file('relay/README.md'))
    expect(readPathRef('(webview/src/App.tsx),')).toEqual(file('webview/src/App.tsx'))
  })
})

describe('что не путь', () => {
  // Ложная ссылка, которой было больше всех верных: обращение к свойству в тексте про код.
  it('обращение к свойству', () => {
    expect(readPathRef('state.items')).toBeNull()
    expect(readPathRef('event.target')).toBeNull()
    expect(readPathRef('panel.compacting')).toBeNull()
  })

  it('сетевой путь - отказ раньше, чем кто-то пойдёт на диск', () => {
    expect(readPathRef('//attacker.example/share/a.ts')).toBeNull()
    expect(readPathRef('\\\\attacker.example\\share\\a.ts')).toBeNull()
    expect(isOpenablePath('//attacker.example/share/a.ts')).toBe(false)
    expect(isOpenablePath('\\\\attacker.example\\share')).toBe(false)
  })

  it('управляющие знаки', () => {
    expect(readPathRef('src/a\u0000.ts')).toBeNull()
    expect(isOpenablePath('src/a\u001b[2J.ts')).toBe(false)
  })

  it('подпись с числом, время, версия, глоб, папка без формы', () => {
    expect(readPathRef('Warning:42')).toBeNull()
    expect(readPathRef('12:30')).toBeNull()
    expect(readPathRef('2.1.247')).toBeNull()
    expect(readPathRef('src/**/*.ts')).toBeNull()
    expect(readPathRef('webview/src/components')).toBeNull()
  })

  it('адрес, фраза с путём внутри, слово, пустота', () => {
    expect(readPathRef('https://example.com/a.txt')).toBeNull()
    expect(readPathRef('see webview/src/App.tsx for this')).toBeNull()
    expect(readPathRef('useEffect')).toBeNull()
    expect(readPathRef('   ')).toBeNull()
  })

  it('домен и дробь', () => {
    expect(readPathRef('example.com')).toBeNull()
    expect(linked('Половина - это 1/2, а сайт - example.com')).toEqual([])
  })
})

describe('пути в обычном тексте', () => {
  // Ради этого всё: на просьбу о списке файлов агент отвечает голыми строками.
  it('список путей', () => {
    const list = [
      '/Users/max/project/README.md',
      '/Users/max/project/package.json',
      '/Users/max/project/src/useSocket.js',
    ]

    expect(linked(list.join('\n'))).toEqual(list)
  })

  it('путь посреди фразы', () => {
    expect(linked('Правка лежит в webview/src/App.tsx:120, посмотри.')).toEqual([
      'webview/src/App.tsx:120',
    ])
  })

  // В прозе строже, чем в бэктиках: голое имя там чаще слово, чем файл.
  it('«Node.js» - слово, а не файл', () => {
    expect(linked('Собрано на Node.js и Next.js')).toEqual([])
    expect(linked('см. package.json')).toEqual([])
  })

  it('каждый символ исходника - на месте и по порядку', () => {
    const text = '  Открой /p/a.ts, потом /p/b.ts.\n'

    expect(
      splitPaths(text)
        .map((chunk) => chunk.text)
        .join(''),
    ).toBe(text)
  })

  // Текст, который весь - путь, возвращается ОДНИМ куском, и этот кусок - ссылка.
  it('весь текст - путь: один кусок, и он ссылка', () => {
    expect(splitPaths('/p/src/useSocket.js:11:15')).toEqual([
      {
        kind: 'path',
        text: '/p/src/useSocket.js:11:15',
        ...file('/p/src/useSocket.js', { line: 11, column: 15 }),
      },
    ])
  })

  it('без путей - один кусок текста', () => {
    expect(splitPaths('Всё готово, тесты зелёные.')).toEqual([
      { kind: 'text', text: 'Всё готово, тесты зелёные.' },
    ])
  })
})

/** Список файлов проекта отвечает раньше любых правил формы. */
describe('файлы, которые у проекта есть', () => {
  const known = knownFiles([
    '.gitignore',
    'Makefile',
    'build',
    'sandbox-project.iml',
    'notes.txtx',
    'src/components/Button.js',
    'src/legacy/Button.js',
    'src/utils/index.ts',
  ])

  it('голое имя в тексте - ссылка, если файл у проекта есть', () => {
    expect(splitPaths('the rules live in .gitignore and nowhere else', known)).toEqual([
      { kind: 'text', text: 'the rules live in ' },
      { kind: 'path', text: '.gitignore', ...file('.gitignore') },
      { kind: 'text', text: ' and nowhere else' },
    ])
  })

  it('нет у проекта - не ссылка', () => {
    expect(linked('the rules live in .gitignore')).toEqual([])
    expect(linked('runs on Node.js', known)).toEqual([])
  })

  it('в бэктиках список важнее расширения', () => {
    expect(readPathRef('sandbox-project.iml')).toEqual(file('sandbox-project.iml'))
    expect(readPathRef('notes.txtx')).toBeNull()
    expect(readPathRef('notes.txtx', true, known)).toEqual(file('notes.txtx'))
  })

  it('имя без расширения - только в бэктиках', () => {
    expect(readPathRef('Makefile', true, known)).toEqual(file('Makefile'))
    expect(linked('run the build again', known)).toEqual([])
    expect(readPathRef('build', false, known)).toBeNull()
  })

  it('папки перед именем сверяются с хвостом пути целыми кусками', () => {
    expect(known.hasFile('components/Button.js')).toBe(true)
    expect(known.hasFile('legacy/Button.js')).toBe(true)
    expect(known.hasFile('ponents/Button.js')).toBe(false)
    expect(known.hasFile('src/Button.js')).toBe(false)
    expect(known.hasFile('./src/components/Button.js')).toBe(true)
    expect(known.hasFile('src\\components\\Button.js')).toBe(true)
  })

  it('папка - не файл', () => {
    expect(known.hasFile('utils')).toBe(false)
    expect(known.hasFile('src/utils/')).toBe(false)
  })

  it('строка после известного имени читается', () => {
    expect(splitPaths('see .gitignore:3', known)).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'path', text: '.gitignore:3', ...file('.gitignore', { line: 3 }) },
    ])
  })
})

/**
 * Папка - своя цель клика: её показывают, а не открывают. Правило уже, чем для файлов:
 * у папки нет расширения, по которому её узнать, и одной формы мало - нужно место.
 */
describe('папки в ответе', () => {
  const known = knownFiles(['src/utils/index.ts', 'webview/src/feed/feed.ts', 'notes.md'])

  it('дот-имя не из известных дот-файлов - папка', () => {
    expect(readPathRef('~/.claude')).toEqual(folder('~/.claude'))
    expect(readPathRef('/home/ivan/.config')).toEqual(folder('/home/ivan/.config'))
  })

  it('известные дот-файлы - файлы', () => {
    expect(readPathRef('~/.gitignore')).toEqual(file('~/.gitignore'))
    expect(readPathRef('~/.claude/settings.json')).toEqual(file('~/.claude/settings.json'))
  })

  it('слеш на конце - папка', () => {
    expect(readPathRef('/var/log/')).toEqual(folder('/var/log/'))
    expect(readPathRef('~/Downloads/')).toEqual(folder('~/Downloads/'))
  })

  // Форма - не место: те же слова в комментарии должны остаться словами.
  it('форма без корня, которой у проекта нет, - не папка', () => {
    expect(readPathRef('foo/bar/')).toBeNull()
    expect(readPathRef('src/utils')).toBeNull()
  })

  it('папка проекта со слешем внутри - с завершающим слешем и без', () => {
    expect(readPathRef('src/utils', true, known)).toEqual(folder('src/utils'))
    expect(readPathRef('src/utils/', true, known)).toEqual(folder('src/utils/'))
    expect(readPathRef('webview/src/feed', false, known)).toEqual(folder('webview/src/feed'))
  })

  it('голое имя папки - не ссылка', () => {
    expect(readPathRef('utils', true, known)).toBeNull()
    expect(linked('the utils in question', known)).toEqual([])
  })

  it('слеш в прозе - не путь', () => {
    expect(splitPaths('и/или, w/e', known)).toEqual([{ kind: 'text', text: 'и/или, w/e' }])
  })

  // Строку в папке не пишут - номер значит файл.
  it('номер строки - всегда файл', () => {
    expect(readPathRef('~/.claude:12')).toEqual(file('~/.claude', { line: 12 }))
    expect(readPathRef('/home/ivan/.claude/hooks.ts:12')).toEqual(
      file('/home/ivan/.claude/hooks.ts', { line: 12 }),
    )
  })

  it('папка в прозе', () => {
    expect(splitPaths('lives in ~/.claude, next to the rest')).toEqual([
      { kind: 'text', text: 'lives in ' },
      { kind: 'path', text: '~/.claude', ...folder('~/.claude') },
      { kind: 'text', text: ', next to the rest' },
    ])
  })
})

describe('ссылки в тексте: адреса и пути', () => {
  it('адрес - адресом, путь - путём, остальное - текстом', () => {
    expect(splitLinks('see https://example.com/x and src/App.tsx:3')).toEqual([
      { kind: 'text', text: 'see ' },
      { kind: 'url', text: 'https://example.com/x' },
      { kind: 'text', text: ' and ' },
      { kind: 'path', text: 'src/App.tsx:3', ...file('src/App.tsx', { line: 3 }) },
    ])
  })

  it('точка в конце фразы - не часть адреса, парная скобка - часть', () => {
    expect(splitLinks('Status: https://status.claude.com.')).toEqual([
      { kind: 'text', text: 'Status: ' },
      { kind: 'url', text: 'https://status.claude.com' },
      { kind: 'text', text: '.' },
    ])
    expect(splitLinks('(https://example.com/foo(bar))')).toEqual([
      { kind: 'text', text: '(' },
      { kind: 'url', text: 'https://example.com/foo(bar)' },
      { kind: 'text', text: ')' },
    ])
  })

  it('путь внутри адреса - часть адреса', () => {
    expect(splitLinks('http://localhost:5173/src/App.tsx')).toEqual([
      { kind: 'url', text: 'http://localhost:5173/src/App.tsx' },
    ])
  })

  it('чужие схемы - текст', () => {
    expect(splitLinks('ftp://host/a.txt javascript:alert(1)')).toEqual([
      { kind: 'text', text: 'ftp://host/a.txt javascript:alert(1)' },
    ])
  })

  it('разметка не разбирается: звёздочки - сами себя', () => {
    expect(splitLinks('**bold** text')).toEqual([{ kind: 'text', text: '**bold** text' }])
  })

  it('склейка кусков - исходник символ в символ', () => {
    const text = 'Ошибка в /p/a.ts:3 (см. https://x.dev/a), и ~/.claude/x.json.\n'

    expect(
      splitLinks(text)
        .map((chunk) => chunk.text)
        .join(''),
    ).toBe(text)
  })
})
