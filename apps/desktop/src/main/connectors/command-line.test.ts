import { it, expect, describe } from 'vitest'

import { parseEnvLine, splitCommandLine } from './command-line'

describe('splitCommandLine', () => {
  it('пробелы делят, кавычки склеивают, косая экранирует', () => {
    expect(splitCommandLine('npx -y @scope/server --dir "My Files"')).toEqual([
      'npx',
      '-y',
      '@scope/server',
      '--dir',
      'My Files',
    ])
    expect(splitCommandLine('node \'a b\' c\\ d ""')).toEqual(['node', 'a b', 'c d', ''])
  })

  it('незакрытая кавычка - null', () => {
    expect(splitCommandLine('node "x')).toBeNull()
  })

  it('с окружением - как в терминале: ~, $HOME и ${NAME}, но не в одинарных кавычках', () => {
    const env = { HOME: '/Users/me', TOKEN: 't1' }

    expect(
      splitCommandLine('node ~/a.js ~ "$HOME/b" --t=${TOKEN} \'$HOME\' a~ \\$HOME', env),
    ).toEqual([
      'node',
      '/Users/me/a.js',
      '/Users/me',
      '/Users/me/b',
      '--t=t1',
      '$HOME',
      'a~',
      '$HOME',
    ])
    expect(splitCommandLine('node "~/a" $ x', env)).toEqual(['node', '~/a', '$', 'x'])
  })

  it('неизвестная переменная - null, а не пустая строка', () => {
    expect(splitCommandLine('node $MISSING', { HOME: '/h' })).toBeNull()
  })
})

describe('parseEnvLine', () => {
  it('пары KEY=value, значение с пробелом в кавычках', () => {
    expect(parseEnvLine('API_KEY=abc URL="https://x.dev/a b" EMPTY=')).toEqual({
      API_KEY: 'abc',
      URL: 'https://x.dev/a b',
      EMPTY: '',
    })
    expect(parseEnvLine('')).toEqual({})
  })

  it('подстановки и в значениях: KEY=~/x, KEY=$HOME', () => {
    expect(parseEnvLine('DIR=~/data ROOT=$HOME', { HOME: '/h' })).toEqual({
      DIR: '/h/data',
      ROOT: '/h',
    })
  })

  it('слово без «=» или кривое имя - null', () => {
    expect(parseEnvLine('KEY')).toBeNull()
    expect(parseEnvLine('1KEY=x')).toBeNull()
  })
})
