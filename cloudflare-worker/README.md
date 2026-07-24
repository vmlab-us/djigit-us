# Бесплатный production deployment: Cloudflare Workers

Этот вариант заменяет Cloud Run и не требует банковской карты. Workers Free включает
100 000 Worker requests в день; static assets бесплатны. Один поиск делает один
запрос справочника и по одному Worker request на выбранного дилера.

## Архитектура

- `https://djigit-dealer-inventory.djigit-us.workers.dev` — Worker + static assets.
- Google Sign-In в режиме Testing; единственный test user —
  `djigitusllc@gmail.com`.
- Worker валидирует Google ID token по Google JWKS, audience, issuer, срок действия,
  подтверждённый email и собственный allowlist.
- Google Sheet читается service account с ролью Viewer.
- Browser запускает до пяти dealer checks параллельно и показывает карточки только
  после завершения всех проверок или общего лимита 120 секунд.
- URL дилера всегда берётся из доверенной Sheet; клиент передаёт только `dealerId`.

## Первичная настройка

```bash
pnpm install
npx wrangler login
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
pnpm deploy
```

`GOOGLE_SERVICE_ACCOUNT_JSON` — содержимое JSON key отдельного service account.
Файл ключа не коммитить. Service account должен иметь только Viewer-доступ к исходной
Sheet, без project-wide ролей.

В Google Auth Platform:

1. Audience: External, Publishing status: Testing.
2. Test users: только `djigitusllc@gmail.com`.
3. Web OAuth client origin:
   `https://djigit-dealer-inventory.djigit-us.workers.dev`.
4. Записать Client ID в `GOOGLE_OAUTH_CLIENT_ID` в `wrangler.jsonc`.

## Локальная проверка

```bash
cp .dev.vars.example .dev.vars
pnpm test
pnpm dev
```

Локальный UI требует настоящий Google ID token с разрешённым email. Secrets не
выводятся в logs.

## Ограничения бесплатного варианта

- Workers Free ограничивает CPU до 10 ms на invocation. Поэтому orchestration
  выполняется браузером короткими server-side запросами по одному дилеру.
- Активный поиск нельзя восстановить после закрытия вкладки.
- Generic JSON-LD adapter не покрывает сайты без structured inventory data.
- Для platform adapters нужны реальные URLs и fixtures после предоставления доступа
  к Google Sheet.
