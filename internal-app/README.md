# DJIGIT internal dealer inventory search — Node reference implementation

> Production переведён на бесплатный Cloudflare Workers вариант в
> `../cloudflare-worker/`. Этот каталог оставлен как проверенная Node reference
> implementation и набор расширенных тестов; разворачивать его в Cloud Run не нужно.

Закрытый on-demand поиск inventory. Публичный сайт остаётся на GitHub Pages. Эта
Node-версия не является текущим production deployment; актуальная бесплатная версия
работает в `../cloudflare-worker/` и использует Google Sign-In.

## Почему отдельный сервис

Текущий сайт — набор статических HTML/CSS/JS на GitHub Pages. GitHub Pages не может
проверять роли на сервере, хранить Google credentials или безопасно собирать dealer
inventory. Поэтому имитировать защиту клиентским JavaScript нельзя.

## Запуск

Требуется Node.js 20+.

```bash
pnpm install
cp .env.example .env
pnpm test
pnpm start
```

Secrets задаются в deployment environment, `.env` не коммитится. Эти инструкции
относятся только к локальному/reference запуску.

## Доступ `dealer_inventory_search`

1. Создайте Cloudflare Access self-hosted application для внутреннего hostname.
2. Разрешите вход только корпоративным identity/email.
3. Запишите application audience в `CLOUDFLARE_ACCESS_AUD`.
4. Для текущей конфигурации оставьте
   `DEALER_INVENTORY_ALLOWED_EMAILS=djigitusllc@gmail.com`.
5. Для отзыва права удалите email из allowlist и redeploy/restart service.

JWT проверяется сервисом по Cloudflare JWKS, затем email отдельно сверяется с allowlist.
Одной проверки на proxy недостаточно.

## Google Sheet

1. Создайте отдельный service account без других ролей.
2. Откройте Google Sheet → Share.
3. Добавьте email service account с ролью **Viewer**.
4. Запишите email и private key в server-side variables.
5. Не добавляйте credentials в frontend или репозиторий.

Читаются только вкладки `Дилерские центры` и `Fleet-контакты`. Кэш справочника живёт
20 минут, кнопка «Обновить справочник» выполняет принудительное чтение.

## Адаптеры

Первая вертикаль использует `src/adapters/jsonld.js`: она извлекает schema.org
`Vehicle`/`Car`/`Product` из dealer HTML и нормализует результат. Fixture находится
в `test/fixtures/`.

Чтобы добавить platform adapter:

1. Создайте модуль в `src/adapters/` с `id`, `supports(dealer)` и
   `search({ dealer, query, fetchPage, signal })`.
2. Используйте только переданный `fetchPage`: он ограничивает HTTPS host доверенным
   доменом из Sheet и блокирует private/metadata IP.
3. Возвращайте единую модель через `normalizeVehicle`.
4. Добавьте обезличенный fixture и unit test.
5. Зарегистрируйте адаптер перед fallback в `src/adapters/index.js`.

Нельзя обходить CAPTCHA/login wall или принимать URL от браузера.

## API

- `GET /api/internal/dealers?refresh=1`
- `POST /api/internal/inventory/search`
- `GET /api/internal/inventory/search/:id`
- `POST /api/internal/inventory/search/:id/cancel`

Все endpoints и UI защищены одной server-side middleware. Результат принадлежит
запустившему его пользователю. Контакты не пишутся в application log.

## Проверка

```bash
pnpm test
node --check src/server.js
docker build -t djigit-inventory .
```

Перед production:

- предоставить Sheet доступ service account;
- заполнить Cloudflare Access variables и allowlist;
- выполнить ручную проверку минимум трёх автомобилей;
- собрать fixtures и специализированные adapters после аудита 5–10 реальных сайтов;
- настроить HTTPS reverse proxy/internal hostname и закрыть прямой origin;
- проверить response header `X-Robots-Tag` и отсутствие URL в sitemap/navigation.

## Ограничения текущей вертикали

- Google Sheet не был доступен подключённому аккаунту во время разработки (`403`),
  поэтому реальный platform audit и выбор 5–10 дилеров не выполнены.
- Generic JSON-LD покрывает только сайты с достаточными structured data; platform-
  specific JSON/XHR adapters ещё требуют реальных dealer URLs и fixtures.
- История поиска намеренно не сохраняется.
- Процесс хранит активные поиски in-memory; для нескольких replicas нужен Redis.
- Изображения не проксируются, чтобы не расширять SSRF-поверхность.
