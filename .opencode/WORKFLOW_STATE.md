# Задача: рефакторинг + тесты

Ветка: `refactor/dashboard-structure` (от `main`, d0f2c51).
Решение пользователя: рефакторинг без смены поведения + vitest и шаг в CI, затем починить все четыре найденных хвоста.

## Инварианты
- Поведение, DOM-структура, классы, aria, i18n-ключи не меняются (кроме явно заказанных четырёх фиксов).
- Стиль кода — как в существующих файлах.
- `dist/gui-experimental.cjs` пересобран в том же изменении (CI падает на грязном `dist`).
- Никаких коммитов и смены ветки сабагентами.

## Состояние
- [x] разбить `src/gui/dashboard.tsx` (832 → 405 строк) на `bits.tsx` / `row.tsx` / `output.tsx` / `css.ts`, дедуп reasoning-блоков и токен-чипов, меньше проходов в memo-цепочке
- [x] vitest 4.1.12, `npm test`, отдельный `vitest.config.ts`, шаг в `ci.yml` и `release.yml`, `test/` и конфиг в `tsconfig.include`
- [x] тесты: `test/model.test.ts` (51) + `test/panel-state.test.ts` (8) = 59, включая страж streaming-инварианта `reasoningBlocks`
- [x] фикс 1: `AGENTS.md` — таблица Source layout, секция Verify, `panelStates`-гатча (файл в `.gitignore`, живёт локально)
- [x] фикс 2: `dist is up to date` добавлен в `release.yml`
- [x] фикс 3: `panelStates` вынесен в host-free `src/gui/panel-state.ts`, ограничен LRU на 100 записей
- [x] фикс 4: `formatTokens` округляет до выбора юнита: 999.6 → `"1k"`, 999.4 → `"999"`
- [x] ревью: три круга (FIX → OK → OK), тестер: PASS
- [ ] подтверждение пользователя и коммит

## Финальное состояние
`typecheck` 0 · `npm test` 59/59 (детерминизм на трёх сидах) · `build` 0 · `dist` sha256
`8ff9950806ff75d1eddeac8502d38f36d2ce0689a3aacb1c0ff71070722812fd`, сборка идемпотентна ·
`npm ci --dry-run` 0 · smoke-загрузка бандла без хоста: `{i18n, setup}`, en/ru по 35 ключей без расхождений.

## Остались как есть (решено не трогать)
- Zip релиза не содержит `test/` и `vitest.config.ts`, хотя `package.json` объявляет `npm test`: распакованный архив не может прогнать тесты. На работу плагина не влияет.
- `vite.config.ts` не в таблице Source layout (не входит в поставку плагина).
- GUI-поведение (тик, reasoning, focus/scroll, pin-restore, нотификации) — только ручная проверка в Desktop.
