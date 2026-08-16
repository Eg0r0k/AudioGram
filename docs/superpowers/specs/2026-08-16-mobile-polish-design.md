# Мобильная полировка: стеклянные тосты, парящий мини-плеер, подтверждение удаления данных

Дата: 2026-08-16. Статус: дизайн согласован.

Три независимых улучшения UX. Общая цель: убрать «глухие» непрозрачные плашки
(тосты, мини-плеер) и защитить разрушительное действие «Очистить всё»
подтверждением.

## 1. Тосты Sonner — стекло + blur

**Файл:** `src/components/ui/sonner/Sonner.vue`

Сейчас: `--normal-bg: var(--popover)` задан инлайн в `:style`, тосты — почти
чёрные плоские плашки с `border: none !important`.

Изменения (все — в `<style>`-блоке, не в инлайн `:style`, потому что
`color-mix` в инлайн-стилях молча теряется в happy-dom при тестировании):

- фон: `--normal-bg: color-mix(in oklch, var(--popover) 70%, transparent)`,
  задаётся на `.toaster` в CSS; инлайн-объект `:style` больше не содержит
  `--normal-bg`;
- `[data-sonner-toast]`: `backdrop-filter: blur(12px)` (+ `-webkit-`-префикс),
  граница `1px solid color-mix(in oklch, var(--border) 60%, transparent)`
  вместо `border: none`, мягкая тень (`0 8px 24px rgb(0 0 0 / 0.28)`);
- иконки, кнопки действий, радиусы — без изменений.

## 2. Парящий мини-плеер + централизованный резерв места

**Файлы:** `src/layouts/MobileLayout.vue`, `src/components/layout/mobile/MiniPlayer.vue`

Сейчас: MiniPlayer стоит в flex-потоке колонки лейаута — занимает полосу с
фоном лейаута (`bg-muted dark:bg-card`), контент не заходит под него и не
докручивается до низа «под плеером».

Изменения:

- **Overlay.** MiniPlayer переносится из потока в absolute-обёртку внизу
  лейаута: `absolute inset-x-0 bottom-0`, z-index ниже фулл-плеера и правой
  панели; `pointer-events-none` на обёртке, `pointer-events-auto` на самом
  плеере; safe-area (`bottom` из `useScreenSafeArea`) учитывается паддингом
  обёртки. Корень лейаута получает `relative`.
- **Без подложки.** У обёртки нет фона — «полоса» исчезает, контент виден и
  скроллится под плеером. Карточка плеера (тинт от обложки) остаётся как есть,
  добавляется только тень (`shadow-lg/40` уровня) для эффекта парения.
- **Резерв места.** На корне лейаута CSS-переменная
  `--mini-player-h: 64px` (высота h-14 + отступ), когда `currentTrack` есть,
  иначе `0px`. `<main>` получает `padding-bottom: var(--mini-player-h)`.
  Страницы не меняются — резерв работает централизованно для всех.

## 3. Диалог подтверждения «Удалить все данные»

**Файлы:** новый `src/pages/settings/components/ClearAllDataDialog.vue`;
правка `src/pages/settings/StorageSettings.vue`; новые локали
`dialogs/clearAllData.json` (en, ru) + регистрация в обоих
`locales/*/dialogs/index.ts`.

Сейчас: кнопка «Очистить всё» (`StorageSettings.vue`) вызывает
`clearAllData()` мгновенно — случайный клик уничтожает библиотеку.

Изменения:

- **Компонент.** `ClearAllDataDialog.vue` на базе `@/components/ui/dialog`
  (паттерн — существующий `DeleteConfirmDialog.vue`, но локальный, без
  глобального composable):
  - props: `open: boolean`, `stats: { tracksCount; albumsCount; artistsCount; totalUsed: string }`,
    `pending?: boolean`;
  - emits: `update:open`, `confirm`;
  - тело: предупреждение + сводка «N треков · N альбомов · N исполнителей ·
    размер»;
  - футер: «Отмена» (`ghost-primary`) и «Удалить» (`destructive`).
- **Задержка кнопки.** «Удалить» заблокирована 3 секунды после открытия,
  в подписи обратный отсчёт: «Удалить (3)» → «(2)» → «(1)» → активна.
  Отсчёт перезапускается при каждом открытии; таймер очищается при закрытии
  и unmount.
- **Интеграция.** В `StorageSettings.vue` кнопка «Очистить всё» открывает
  диалог; `confirm` → существующий `clearAllData()` из
  `useStorageSettings`; на время операции кнопка в состоянии `pending`
  (`isClearing`); по завершении — `toast.success` и диалог закрывается.
  Логика `useStorageSettings` не меняется.

## Тесты

- `ClearAllDataDialog`: кнопка «Удалить» disabled сразу после открытия;
  становится активной после 3 с (fake timers); `confirm` эмитится только по
  клику после отсчёта; повторное открытие перезапускает отсчёт.
- Ручная проверка (нет практичного способа юнит-тестировать blur/overlay):
  тосты поверх контента, мини-плеер парит, страницы докручиваются до низа,
  safe-area на мобилке.

## Вне скоупа

- Остальные кнопки удаления в настройках (lyrics/folders/timings/offline) —
  без подтверждения, как раньше.
- Изменения тинта/цвета карточки мини-плеера.
