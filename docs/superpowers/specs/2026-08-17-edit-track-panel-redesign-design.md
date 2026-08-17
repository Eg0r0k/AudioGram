# EditTrackPanel v2 + generic EntitySelectPanel — дизайн

Дата: 2026-08-17
Статус: одобрено Егором (вариант A из обсуждения)

## Проблема

`src/modules/right-panel/components/panels/EditTrackPanel.vue` сделан наспех:

- 83 строки закомментированного шаблона (старый кастомный ввод артистов) лежат в файле;
- вместо него — сырой `TagsInput` без автодополнения по библиотеке и с литеральным
  `+` вместо иконки удаления тега; ошибки `errors.artists` не привязаны;
- автодополнение альбома — самодельный дропдаун на `blur` + `setTimeout(100)`:
  без клавиатурной навигации и ARIA, с гонками фокуса;
- нельзя создать новый альбом — только выбрать существующий;
- мёртвый `artistSearch` ref, `eslint-disable vuejs-accessibility/label-has-for`;
- лимит 240 символов применяется к каждому артисту отдельно; строки сообщений
  валидации запекаются при создании схемы и не реагируют на смену языка;
- «назад»/закрытие молча теряет несохранённые изменения.

## Решение (вариант A)

Выделить из `AddTracksPanel` обобщённый компонент выбора сущностей и построить
на нём выбор артистов и альбома в форме редактирования. Никаких поповеров —
выбор сущности это отдельный экран правой панели (инфраструктура depth/back
уже есть и используется `AddTracksPanel`).

### 1. `EntitySelectPanel` — generic-компонент

Место: `src/components/entity-select/EntitySelectPanel.vue` (+ index.ts).

Контракт (props):
- `title: string` — заголовок панели;
- `items: T[]` + `isLoading` + `hasNextPage`/`loadMore` — данные отдаёт
  родитель (панель не знает про источники); поиск наружу через
  `v-model:search` (debounce внутри, 200мс);
- `selectedKeys: Set<string> | string | null` — режим определяется пропсом
  `multiple: boolean`;
- `getKey(item): string`;
- `creatable?: boolean` — при непустом поиске без точного совпадения внизу
  списка строка «Создать „X"»;
- слот `#row="{ item, isSelected, toggle }"` — рендер строки;
- слот `#empty` (дефолт — `Empty` + `EmptyDescription`).

Эмиты: `confirm(keys)`, `create(name)`, `back`, `close`.

Внутри: `RightPanelHeader`, поисковый инпут (как в AddTracksPanel),
`VirtualScrollable`, `Empty`, `AddFloatingButton` (FAB подтверждения,
для single-режима — подтверждение сразу по клику строки, FAB не нужен).

### 2. Рефактор `AddTracksPanel`

Переводится на `EntitySelectPanel` с сохранением поведения 1:1
(поиск, бесконечная подгрузка, мультиселект с drag-выделением, FAB,
мутации по entityType). Drag-выделение (`useSelection.attachDragListeners`)
остаётся в AddTracksPanel — generic-панель отдаёт ref контейнера через expose
или слот-пропс. Это проверка абстракции на живом потребителе.

### 3. Пикеры артистов и альбома

- `ArtistSelectPanel`: мультиселект по артистам библиотеки
  (`artistRepository` через существующие query), «Создать „X"» включено.
- `AlbumSelectPanel`: сингл-выбор по альбомам (`searchAlbums`),
  «Создать „X"» включено.
- Открытие через right-panel store: новый view `entity-select` с payload
  `{ kind: "artists" | "album", selected, onConfirm }` (по образцу
  `RightPanelAddTracksPayload.onConfirmed`), глубина +1 от формы.

### 4. `EditTrackPanel` v2

- Удалить: закомментированный блок, `artistSearch`, eslint-disable.
- Поля: название (Input), артисты (чипы значений + кнопка «Изменить» →
  ArtistSelectPanel), альбом (строка значения + «Изменить» → AlbumSelectPanel),
  номер трека, номер диска (числовые Input, необязательные, ≥ 1).
- Валидация: title 1..120; артистов ≥ 1, каждый ≤ 120; albumId ИЛИ albumTitle
  (новый альбом) обязателен; trackNo/diskNo — целые ≥ 1 или пусто. Сообщения —
  через функции `t()` внутри резолвера (реактивны к locale).
- Dirty-state: при `hasChanges` и «назад»/закрытии — `ConfirmDialog`
  «Выйти без сохранения?» (переиспользовать существующий диалог подтверждения,
  как у очистки истории).
- Сохранение нового альбома: расширить `updateTrackMetadataAndSync` параметром
  `albumTitle?: string` — при отсутствии `albumId` найти альбом по identity
  (первый артист + нормализованное название, та же логика, что в
  `EntityResolver.resolveAlbums`) или создать строку альбома.
- После сохранения — как сейчас: `syncTrackMetadata`, toast, возврат в
  TrackInfoPanel.

### 5. Тесты

- `EntitySelectPanel`: поиск фильтрует, клик выбирает (single подтверждает
  сразу), FAB подтверждает мультиселект, строка «Создать» появляется только
  при непустом поиске без точного совпадения и эмитит `create`.
- `updateTrackMetadataAndSync` с `albumTitle`: находит существующий альбом
  по identity, создаёт новый при отсутствии.
- Dirty-confirm: изменённая форма + back → диалог; без изменений → сразу назад.

## Порядок реализации

1 → 2 → 3 → 4 → 5; каждая фаза оставляет приложение рабочим
(type-check + eslint + vitest зелёные).

## Вне скоупа

Редактирование жанра, года, обложки, лирики; редактирование remote-треков
(форма по-прежнему только для библиотечных строк с локальным источником).
