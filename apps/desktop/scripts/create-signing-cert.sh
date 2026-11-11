#!/usr/bin/env bash
#
# Один раз на всю жизнь проекта: создаёт самоподписанный сертификат подписи кода
# «Agentic Workstation Code Signing», кладёт его в связку ключей входа, а копию (.p12) - в
# корень репозитория (git её не видит). Ничего не спрашивает. Подробности и почему
# так - docs/code-signing.md.
#
#   bash apps/desktop/scripts/create-signing-cert.sh
#
# Доверие сертификату не выдаётся, и системного окна с паролем учётной записи нет:
# подписывает сборку наш хук (scripts/sign-app.cjs) прямо через codesign, а ему
# доверие не нужно. У людей, которые ставят IDE, доверия к нему тоже нет - и не надо.

set -euo pipefail

CERT_NAME="Agentic Workstation Code Signing"
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
OUTPUT="$REPO_ROOT/agentic-workstation-code-signing.p12"
LOGIN_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

# Пароль копии фиксированный и записан в docs/code-signing.md: секрет - сам файл,
# а пустой пароль macOS при импорте не принимает.
P12_PASSWORD="agentic-workstation"

# Второй сертификат с тем же именем - худшее, что может случиться: сборки подпишутся
# им, и установленные копии перестанут принимать обновления.
if security find-certificate -c "$CERT_NAME" "$LOGIN_KEYCHAIN" >/dev/null 2>&1; then
  echo "Сертификат «$CERT_NAME» уже есть в связке ключей. Новый не создаю." >&2
  exit 1
fi

if [ -e "$OUTPUT" ]; then
  echo "Копия $OUTPUT уже есть - импортируй её (docs/code-signing.md), новый не создаю." >&2
  exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

cat >"$WORK/cert.cnf" <<CONF
[ req ]
distinguished_name = dn
x509_extensions = ext
prompt = no
[ dn ]
CN = $CERT_NAME
[ ext ]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
CONF

# Системный /usr/bin/openssl (LibreSSL): его .p12 security импортирует без вопросов.
# Срок - 20 лет: подпись не должна истечь у установленных копий.
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 7300 -config "$WORK/cert.cnf" \
  -keyout "$WORK/key.pem" -out "$WORK/cert.pem" 2>/dev/null
/usr/bin/openssl pkcs12 -export -name "$CERT_NAME" -passout "pass:$P12_PASSWORD" \
  -inkey "$WORK/key.pem" -in "$WORK/cert.pem" -out "$OUTPUT" 2>/dev/null
chmod 600 "$OUTPUT"

# -T codesign: без него каждая подпись при сборке висит на запросе доступа к ключу.
security import "$OUTPUT" -k "$LOGIN_KEYCHAIN" -P "$P12_PASSWORD" -T /usr/bin/codesign >/dev/null

security find-identity -p codesigning "$LOGIN_KEYCHAIN" | grep "$CERT_NAME"
echo "Готово. Копия: $OUTPUT - не удалять и не терять."
