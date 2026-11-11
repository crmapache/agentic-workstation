---
paths:
  - 'apps/desktop/src/main/updates/**'
  - 'apps/desktop/src/main/app-profile.ts'
  - 'apps/desktop/src/shared/updates.ts'
  - 'apps/desktop/electron-builder.yml'
  - 'apps/desktop/scripts/**'
  - 'docs/releasing.md'
  - 'docs/code-signing.md'
---

# Обновления, сборка и выпуск

Устройство - ADR 0004, выпуск - `docs/releasing.md`, подпись - `docs/code-signing.md`.

- **После любой правки здесь - `pnpm --filter @agentic-workstation/desktop update:e2e`.**
  Около двух минут, две настоящие сборки, оба сценария (подделка отвергнута, честное
  обновление встало). Юнит-тесты подмену бандла не проверяют.
- **Не менять без нового ADR:** `appId` в `electron-builder.yml`, имя сертификата в
  `scripts/sign-app.cjs` и `scripts/create-signing-cert.sh`, имена
  артефактов (`agentic-workstation-mac-arm64.*`, `latest.json`), формат манифеста. От них
  зависят уже установленные копии: старая версия должна понять новый релиз.
- Формат манифеста меняется только совместимо: новые поля можно добавлять, старые не
  трогать.
- Проверка подписи новой версии (`verifyUpdate`) - главная защита от подменённого
  релиза. Не ослаблять, не обходить флагом.
- Новый сертификат подписи не создавать никогда, если старый существует: это
  отключит обновления у всех установленных копий. Копия - `agentic-workstation-code-signing.p12`
  в корне, не удалять.
- Подписывает хук `scripts/sign-app.cjs`, а не electron-builder (`identity: null`
  намеренно): встроенная подпись требует доверия к сертификату, а его macOS выдаёт
  только через окно с паролем.
- Сборки - только arm64. Публикация - только скиллом `/release` по прямой команде.
