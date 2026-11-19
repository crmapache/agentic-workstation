import { it, expect, describe } from 'vitest'

import { commandLabel, commandSteps } from './StreamSwitcher.utils'

describe('команда на чипе', () => {
  it('двумя словами, без пути программы и флагов', () => {
    expect(commandLabel('pnpm dev --port 5315')).toBe('pnpm dev')
    expect(commandLabel('/usr/local/bin/sandbox.sh -v')).toBe('sandbox.sh')
  })
})

describe('команда по шагам', () => {
  it('цепочка - строкой на шаг: && и || в конце строки, ; - перевод строки', () => {
    expect(
      commandSteps('cd /tmp/web && npm run build 2>&1 | grep -E "error" ; echo "== ui" || true'),
    ).toBe(
      ['cd /tmp/web &&', 'npm run build 2>&1 | grep -E "error"', 'echo "== ui" ||', 'true'].join(
        '\n',
      ),
    )
  })

  it('внутри кавычек, скобок и подстановок не режет', () => {
    expect(commandSteps(`echo 'a; b && c' ; x="$(a && b; c)" && { d; e; }`)).toBe(
      [`echo 'a; b && c'`, `x="$(a && b; c)" &&`, '{ d; e; }'].join('\n'),
    )
    expect(commandSteps('echo \\; done && ls')).toBe(['echo \\; done &&', 'ls'].join('\n'))
  })

  it('комментарий в хвосте целиком: его ; не начинает шаг', () => {
    expect(commandSteps('ls; # потом; rm -rf x')).toBe(['ls', '# потом; rm -rf x'].join('\n'))
    expect(commandSteps('echo a#b; ls')).toBe(['echo a#b', 'ls'].join('\n'))
  })

  it('ветки case, свои переводы строк, heredoc и непарные кавычки - как есть', () => {
    expect(commandSteps('case $x in a) b;; esac')).toBe('case $x in a) b;; esac')
    expect(commandSteps('a &&\nb; c')).toBe('a &&\nb; c')
    expect(commandSteps('cat <<EOF; x')).toBe('cat <<EOF; x')
    expect(commandSteps(`echo "a; b`)).toBe(`echo "a; b`)
  })

  it('фон & и перенаправления - не шаги', () => {
    expect(commandSteps('sleep 1 & wait; cmd >&2 2>&1')).toBe(
      ['sleep 1 & wait', 'cmd >&2 2>&1'].join('\n'),
    )
  })
})
