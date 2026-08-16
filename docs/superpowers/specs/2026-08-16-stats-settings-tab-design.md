# Вкладка «Статистика» в настройках — дизайн

Дата: 2026-08-16

## Цель

Новая страница `/settings/stats` («Статистика») в настройках, показывающая статистику
прослушивания в дизайн-языке настроек (`SettingsGroup` / `Item` / `ItemTitle` /
`ItemSubtitle`, встроенные мини-визуализации как кольцо в Storage), а не в стиле
карточек `/profile`, который пользователю не нравится.

Данные уже собираются: таблица Dexie `listenEvents` (`trackId`, `artistId`, `albumId`,
`startedAt`, `secondsListened`, `trackDuration`, `completed`, `skipped`), запись ведёт
`stats.service.ts`. Читает `stats.repository.ts` + `stats.queries.ts` +
`useStatsQueries.ts`. Страница — в основном UI поверх этого, плюс несколько новых
методов репозитория.

`/profile` не трогаем (отдельная тема; пользователь недоволен её оформлением, но
изменение/удаление — вне скоупа этой работы).

## Структура страницы (сверху вниз)

1. **`SettingsHeader`** — заголовок «Статистика».

2. **Переключатель периода** — сегмент-контрол: Неделя / Месяц / Год / Всё время.
   По умолчанию — Месяц. Локальный `ref` на странице; маппится в `since`:
   `Date.now() - {7|30|365} * 86_400_000`, «Всё время» → `undefined`.
   Влияет на все блоки, кроме heatmap и серий (они всегда «последний год» — это их
   природа). Реализация — существующий `components/ui/tabs` (`Tabs` + `TabsList` +
   `TabsTrigger`, без `TabsContent`): контент один, меняется только `since`.

3. **Сводка** (`SettingsGroup`) — один составной блок с 3 крупными цифрами
   (tabular-nums): всего времени («N ч M мин»), прослушиваний, уникальных артистов.

4. **Серия + heatmap** (`SettingsGroup`):
   - Ряд `Item` с иконкой огня: заголовок «Серия: N дней подряд», подзаголовок
     «Рекорд: M дней». День засчитан, если суммарно ≥ 1 сыгранного события.
   - Под рядом — существующий `CalendarHeatmap` (365 дней). Компонент уже использует
     `var(--primary)` / `var(--border)`, дополнительной перекраски почти не требует;
     встраиваем с горизонтальным скроллом внутри группы.

5. **Топ треков** (`SettingsGroup`) — 5 рядов `Item`: обложка (`ItemMedia`),
   название + артист, справа — время («4 ч 12 мин») и тонкий горизонтальный бар,
   нормированный на первое место. Кнопка «Показать все» раскрывает до 25 инлайн
   (без отдельной страницы). Клик по ряду — переход к треку не требуется (MVP).

6. **Топ артистов** (`SettingsGroup`) — аналогично: круглая аватарка, имя, время,
   бар. Топ-5, раскрытие до 25.

7. **Дослушивания** — один ряд `Item`: слева SVG-кольцо (как в Storage) с процентом
   дослушиваний, заголовок «Дослушиваешь X% треков», подзаголовок
   «N дослушано · M пропущено». Пропуском считается `skipped`, дослушиванием —
   `completed`; события «между» (недослушал, но не переключил) в проценты не входят,
   процент = completed / (completed + skipped).

8. **Часы активности** — ряд `Item`: заголовок-вывод («Чаще всего слушаешь вечером»),
   в подзаголовке — inline SVG мини-бар-чарт из 24 столбиков (секунды по часам
   локального времени). Вывод: топ-окно из 4 подряд идущих часов по сумме секунд;
   формулировка по границам окна («утром» 5–11, «днём» 11–17, «вечером» 17–23,
   «ночью» 23–5 — берём окно с максимумом и называем его диапазоном часов).

9. **Рекорды** (`SettingsGroup`) — 3 текстовых ряда с иконками Tabler:
   - Самый активный день: «3 мая · 6 ч 41 мин».
   - Трек на репите: трек с максимальным `count` за период.
   - Самая длинная сессия: «3 ч 12 мин». Сессия — события с разрывом
     < 30 мин между `startedAt` (та же логика, что в session-builder рекомендаций);
     длительность = сумма `secondsListened`.

10. **Топ жанров** (`SettingsGroup`) — рендерится только если данные есть
    (у треков могут отсутствовать теги): до 5 рядов — название жанра, тонкий бар,
    время. Без отдельного chart-компонента с /profile.

11. **Очистить историю** — кнопка внизу в стиле «Clear all» из Storage
    (ghost-primary, во всю ширину) + диалог подтверждения по образцу
    `ClearAllDataDialog`. Удаляет все `listenEvents`, инвалидирует stats-запросы.
    `playCount` / `lastPlayedAt` у треков не трогаем (это метаданные библиотеки).

## Пустые состояния

- Совсем нет событий — вместо блоков одна группа с дружелюбным текстом
  («Пока нет истории прослушивания — включи что-нибудь»).
- Нет данных за выбранный период — блоки показывают свои пустые подписи
  (в топах «Нет данных за период»), heatmap остаётся.

## Данные: новые методы `stats.repository.ts`

Все — по образцу существующих (`runSafe` → `Result`, опциональный `since`):

- `summary(since?)` → `{ totalSeconds, playsCount, uniqueTracks, uniqueArtists,
  completedCount, skippedCount }` — один проход по событиям (не-skipped для plays,
  секунды все).
- `hourlyActivity(since?)` → `number[24]` — секунды по часам локального времени.
- `records(since?)` → `{ busiestDay: { date, seconds } | null,
  mostRepeatedTrackId: TrackId | null, longestSessionSeconds: number }`.
- `streaks()` → `{ current: number, best: number }` — по дням за последние 365 дней
  (по `dailyActivity`-логике; день активен при seconds > 0). «current» считает
  и сегодняшний день без активности не рвущим серию до конца дня.
- `deleteAllEvents()` → `void`.

Константу разрыва сессии (30 мин) экспортировать как `SESSION_GAP_MS` из
`stats.repository.ts`, а session-builder рекомендаций перевести на импорт оттуда —
одна константа на проект.

## Данные: запросы

- `query-keys.ts` → добавить ключи `summary`, `hourlyActivity`, `records`,
  `streaks` в раздел `stats`.
- `stats.queries.ts` → соответствующие `queryOptions` со `staleTime` 5 мин.
- `useStatsQueries.ts` → композаблы `useStatsSummary(since?)`,
  `useHourlyActivity(since?)`, `useStatsRecords(since?)`, `useStreaks()`.
  Для «трек на репите» переиспользуем `topTracksMeta` для метаданных.
- Очистка истории — через `statsService` (новый метод `clearHistory()`:
  `deleteAllEvents` + `invalidateStatsQueries`).

## Маршрутизация и вход

- `ROUTE_NAMES.SETTINGS_STATS = "settings-stats"`, путь `/settings/stats`,
  `titleKey: "settings.stats"`, `depth: 4` (как у остальных вкладок).
- `routeLocation.settingsStats()`.
- `SettingsPage.vue`: `SettingsLink` во второй группе (рядом с Audio/Storage),
  иконка `~icons/tabler/chart-bar`.

## Файлы UI

- `src/pages/settings/StatsSettings.vue` — страница-контейнер (период + композиция).
- `src/pages/settings/components/stats/` — секции:
  `StatsPeriodSwitcher.vue`, `StatsSummary.vue`, `StatsStreakSection.vue`,
  `StatsTopTracks.vue`, `StatsTopArtists.vue`, `StatsCompletionRow.vue`,
  `StatsHourlyRow.vue`, `StatsRecords.vue`, `StatsTopGenres.vue`,
  `ClearHistoryDialog.vue`.

## i18n

`settings.json` (en + ru): `settings.index.stats`, `settings.stats.*`
(заголовок, подписи периодов, блоков, пустых состояний, диалога очистки).
Существующие захардкоженные русские строки в `CalendarHeatmap` (aria-label,
«Меньше/Больше») — заодно перевести через i18n, раз компонент теперь используется
в переводимых настройках.

## Тесты

- Юнит-тесты новых методов репозитория (`summary`, `hourlyActivity`, `records`,
  `streaks`, `deleteAllEvents`) — по образцу существующих тестов работы с Dexie
  (fake-indexeddb, как в session-builder/storage-info тестах).
- Компонентные тесты не требуем (в проекте настройки ими не покрыты) — проверка
  страницы руками.

## Вне скоупа

- Изменение или удаление `/profile`.
- Отдельная страница «все топ-треки» (раскрытие инлайн).
- Sonic profile, средний BPM/энергия, статистика библиотеки (есть в Storage).
