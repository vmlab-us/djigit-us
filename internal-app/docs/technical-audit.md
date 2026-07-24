# Технический аудит

Дата: 2026-07-23.

## Репозиторий и deployment

- `vmlab-us/djigit-us`, ветка `main`.
- Стек публичного сайта: статические HTML, CSS и vanilla JavaScript.
- `CNAME` указывает custom domain; репозиторий соответствует GitHub Pages.
- Package manager, backend, database и server-side auth отсутствовали.
- `.openai/hosting.json` отсутствует.
- Публичная навигация и sitemap не содержат internal route.

## Архитектурное решение

Встроить защищённый backend непосредственно в GitHub Pages невозможно. Добавлен
Cloudflare Worker внутри того же репозитория. Он работает на Workers Free, защищён
Cloudflare Access и повторно проверяет Access JWT плюс собственный permission
allowlist. Длинный поиск разбит браузером на отдельные server-side dealer checks,
чтобы каждый invocation укладывался в бесплатный CPU limit. Публичные файлы сайта
не переписаны. Node.js service оставлен только как reference implementation.

## Google Sheet и platform audit

Metadata read для spreadsheet
`1_xeOjMUJvoRxPRL1I579HYMSSMTTdwy3StzqpAzPOJc` вернул `403 PERMISSION_DENIED`.
Поэтому строки дилеров, их домены и повторяющиеся dealer platforms нельзя было
подтвердить. Не следует выдумывать список поддержанных дилеров.

Реализован безопасный fallback JSON-LD adapter и тестовый fixture. После выдачи
read-only доступа следующий обязательный шаг:

1. выгрузить только dealer names/brands/websites;
2. проверить URL и сгруппировать 5–10 сайтов по platform signatures;
3. предпочесть публичные JSON/XHR endpoints, затем HTML;
4. сохранить обезличенные fixtures;
5. добавить platform-specific adapters и три ручные проверки.

## Защита

- server-side JWT validation и отдельный allowlist;
- одинаковая авторизация UI и API;
- `noindex` meta и `X-Robots-Tag`;
- `robots.txt` disallow (не используется как auth);
- URL не принимается от клиента;
- HTTPS domain allowlist строится из доверенного Sheet;
- DNS проверяется против localhost, private/link-local/metadata ranges;
- redirects повторно проходят allowlist/DNS validation;
- credentials и stack traces не отдаются клиенту;
- fleet contacts не включаются в server logs.
