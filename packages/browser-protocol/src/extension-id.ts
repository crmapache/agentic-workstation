/**
 * Постоянный id расширения: открытый ключ в поле `key` манифеста даёт один и тот же id при
 * любой установке «Load unpacked». По id native host пускает только наше расширение
 * (`allowed_origins`). Закрытый ключ распакованному расширению не нужен; его копия - вне git
 * (`agentic-workstation-extension-key.pem` в корне), пригодится для Chrome Web Store.
 *
 * id - первые 32 шестнадцатеричных знака sha256 от DER-ключа, цифры 0-f заменены буквами a-p.
 * Совпадение id и ключа держит тест.
 */
export const EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApMBElpp9iDOoBBqGTGJtRPNRn+wMyv9wjQWrFSrjYoFtokCqgeSZfpvpkDXqeZInsppj5vYr7jOGGUbv5jXU2mrwVw2xsGyqENYPMWTJL38aDRq87Bkaar1+HxZ4bDFUZtnEttWi2QmdQS8lSj9WLTcUu6WiD04b09yIHZGgU92hGpGUP/udggLio0D+3HzkI3EXbKFrMY3anN3DgXkeLRyPXKQZIPr3Ioo80WEqhcSs+bB+5czHjyb/NxyGbrQSI+qml67xOv0cHkS1/pK/sid1s9PRHZFvz/UAZ87qam4D0aqhep5MLf21EscCA2eW7yiVgKhfxHWt95M0Tkme0QIDAQAB'

export const EXTENSION_ID = 'mdlbfahcfjmnkgbmpfjdppaljimjmknc'

/** Адрес расширения для `allowed_origins` манифеста native host. */
export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}/`

/** id расширения из шестнадцатеричного sha256 ключа: 0-f → a-p. */
export const extensionIdFromDigest = (hexDigest: string): string =>
  [...hexDigest.slice(0, 32).toLowerCase()]
    .map((digit) => String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(digit, 16)))
    .join('')
