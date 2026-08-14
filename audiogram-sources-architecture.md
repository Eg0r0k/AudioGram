# Audiogram — архитектура источников музыки

Зафиксированные решения: Navidrome (один сервер, Subsonic API, stream `format=raw`), live-браузинг каталога без полного синка, лайки/статистика только локально, ND-плейлисты read-only, YT-треки живут в библиотеке без скачивания, оффлайн по варианту «б» (remote-трек + прикреплённая копия), полноценный download-менеджер, обобщённый Rust-прокси, порядок работ M1→M6, каскадный `removeFromLibrary`, pin целого альбома из ND-браузинга (артиста — нет), мобильные меню без изменений (bottom-sheet не делаем).

---

## 1. Модель: Каталог ≠ Библиотека

**Каталог** — то, что источник умеет показать. Локальный каталог = Dexie. ND-каталог = live-запросы к Subsonic через TanStack Query (ничего не пишется в БД). YT-каталог = live: поиск и уже существующие browse-страницы (`YtAlbumPage`/`YtArtistPage`/`YtPlaylistPage`), в БД тоже не пишет.

**Библиотека** (Dexie) = локальные треки + **закреплённые (pinned)** remote-треки.

Pin — создание строки `TrackEntity` со снапшотом метаданных. Триггеры:

| Действие | Результат |
|---|---|
| Лайк, добавление в плейлист, «добавить в библиотеку», скачивание | pin, `pinned = 1` — виден на страницах библиотеки |
| Воспроизведение remote-трека из браузинга | shadow-pin, `pinned = 0` — строка существует ради истории/статистики/персиста очереди, в списках библиотеки не показывается |

Pin идемпотентен: детерминированные ID (`nd:<songId>`) → `put()`-upsert. Снапшот лениво обновляется при следующем обращении к треку через провайдер (revalidate-on-view), фонового синка нет.

**Каскад pin'а.** `TrackEntity.albumId`/`artistIds` — обязательные FK, поэтому pin трека upsert'ит shadow-строки `AlbumEntity`/`ArtistEntity` с теми же детерминированными ID (`nd:<albumId>`, `nd:<artistId>`) и флагом `pinned`. Расширяется существующий `entity-resolver.ts`. **Весь каскад — строго через `unitOfWork`** (та же дисциплина, что и планируемый фикс cascade-delete: никаких multi-table записей мимо UoW).

**Оффлайн (вариант «б»).** Копия — отдельная сущность, не мутирует трек. Удалил копию → трек остался в библиотеке, играется стримом. Удалил трек → каскадом удаляется копия и файл.

**Резолв воспроизведения (единая точка):**

```
resolvePlayback(track):
  1. local-трек            → storageService.getAudioUrl (как сейчас)
  2. offlineCopies.get(id) → storageService.getAudioUrl(copy.storagePath)
  3. иначе                 → sources.forTrack(id).resolveStreamUrl(id)
```

---

## 2. Идентичность

Remote-ID — составные брендированные строки. Локальные ID остаются как есть (без префикса) — **ноль миграций существующих FK** в пользовательских БД (плейлисты, listen events, audioFeatures, chapters, covers).

```ts
// types/track-ref.ts
export type SourceKind = "local" | "nd" | "yt"; // "radio" — M6

export type TrackRef =
  | { kind: "local" }
  | { kind: "nd"; songId: string }   // "nd:<songId>"
  | { kind: "yt"; videoId: string }; // "yt:<videoId>"

export function parseTrackRef(id: TrackId): TrackRef; // префикс известен → remote, иначе local
export const ndTrackId = (songId: string) => TrackId(`nd:${songId}`);
export const ytTrackId = (videoId: string) => TrackId(`yt:${videoId}`);
// аналогично ndAlbumId / ndArtistId в пространствах AlbumId / ArtistId
```

Один сервер ND → серверный дискриминатор в ID не нужен. Если когда-нибудь появится мультисервер — новый префикс (`nd2:`) или миграция; осознанный YAGNI.

---

## 3. Схема Dexie (дельта, аддитивная версия + upgrade)

```
tracks:
  storagePath  → optional (пусто для remote; оффлайн-путь НЕ здесь)
  source       → + REMOTE_SUBSONIC, REMOTE_YT
  + pinned: 0 | 1        // upgrade: всем существующим = 1
  индексы: + pinned, + source

albums, artists:
  + pinned: 0 | 1        // upgrade: всем существующим = 1

offlineCopies:            // PK = trackId
  { trackId, storagePath, sizeBytes, format: AudioFormat, downloadedAt }

downloadJobs:             // персист очереди — resume после рестарта
  { id, trackId, status: "queued"|"running"|"done"|"error",
    attempts, error?, batchId?, addedAt }
  индексы: status, batchId

playlists: без изменений — trackIds: TrackId[] уже принимает "nd:*"/"yt:*"
```

`TrackState.BROKEN` остаётся про локальные файлы; «сломанность» remote-трека — рантайм-ошибка резолва, в БД не персистится.

---

## 4. Контракт SourceProvider

`src/modules/sources/` — контракт + реестр. Провайдеры: `local` (тонкая обёртка над репозиториями — чтобы страницы имели один интерфейс), `nd`, `yt` (адаптер поверх существующего `modules/youtube`).

```ts
export interface SourceCapabilities {
  browseArtists: boolean;
  browseAlbums: boolean;
  browsePlaylists: boolean;
  search: boolean;
  download: boolean; // умеет отдать файл для оффлайн-копии
}

// Нормализованные DTO. id — уже полные брендированные ID с префиксом.
export interface SourceTrackDTO {
  id: TrackId; title: string; artistName?: string; albumTitle?: string;
  albumId?: AlbumId; artistIds?: ArtistId[];
  duration?: number; trackNo?: number; discNo?: number;
  coverRef?: string; format?: AudioFormat;
}
export interface SourceAlbumDTO {
  id: AlbumId; title: string; artistId?: ArtistId; artistName?: string;
  year?: number; coverRef?: string; trackCount?: number;
}
export interface SourceArtistDTO { id: ArtistId; name: string; albumCount?: number; coverRef?: string }
export interface SourcePlaylistDTO { id: string; name: string; trackCount: number; coverRef?: string }

export type SourceErrorKind =
  | "UNAVAILABLE" | "AUTH" | "NETWORK" | "NOT_FOUND" | "PARSE" | "UNKNOWN";
export interface SourceError { kind: SourceErrorKind; message: string }

export interface SourceProvider {
  readonly id: SourceKind;
  readonly capabilities: SourceCapabilities;
  readonly isAvailable: boolean; // платформа + настройки (IS_TAURI, сконфигурен ли ND…)

  listArtists(): ResultAsync<SourceArtistDTO[], SourceError>;
  getArtist(id: ArtistId): ResultAsync<{ artist: SourceArtistDTO; albums: SourceAlbumDTO[] }, SourceError>; // добавлен в M2: страница артиста
  listAlbums(p: { offset: number; limit: number; sort: "alpha" | "newest" }):
    ResultAsync<SourceAlbumDTO[], SourceError>;
  getAlbum(id: AlbumId): ResultAsync<{ album: SourceAlbumDTO; tracks: SourceTrackDTO[] }, SourceError>;
  listPlaylists(): ResultAsync<SourcePlaylistDTO[], SourceError>;
  getPlaylist(id: string): ResultAsync<{ playlist: SourcePlaylistDTO; tracks: SourceTrackDTO[] }, SourceError>;
  search(q: string, types: ("track"|"album"|"artist")[], p: { offset: number; limit: number }):
    ResultAsync<{ tracks: SourceTrackDTO[]; albums: SourceAlbumDTO[]; artists: SourceArtistDTO[] }, SourceError>;

  getTrack(id: TrackId): ResultAsync<SourceTrackDTO, SourceError>; // снапшот для pin / revalidate
  coverUrl(coverRef: string, size?: number): string;               // синхронно собирает stream://-URL
  resolveStreamUrl(id: TrackId): ResultAsync<string, SourceError>;
  downloadToFile(id: TrackId, onProgress?: (e: DownloadEvent) => void):
    ResultAsync<{ path: string; format?: AudioFormat }, SourceError>;
}

// registry
export const sources: {
  get(kind: SourceKind): SourceProvider;
  forTrack(id: TrackId): SourceProvider; // через parseTrackRef
  available(): SourceProvider[];
};
```

Все методы — `ResultAsync<_, SourceError>`, до плеера ошибки доходят типизированными; `unwrapResult` только на границе TanStack Query.

---

## 5. Слои данных и страницы

Схема слоёв не меняется, добавляется вторая «нога» под теми же query-паттернами:

```
Dexie → Repository → queries → composables → pages      (локальный каталог + библиотека)
SubsonicClient → provider → queries → composables → pages (remote-каталог, без Dexie)
```

Query-keys (иерархия та же, infinite — только в composable, `skipToken` для условных):

```ts
queryKeys.nd = {
  artists:   () => ["nd", "artists"] as const,
  albumsInf: (sort: string) => ["nd", "albums", sort] as const, // useInfiniteQuery в composable
  album:     (id: AlbumId) => ["nd", "album", id] as const,
  playlists: () => ["nd", "playlists"] as const,
  playlist:  (id: string) => ["nd", "playlist", id] as const,
  search:    (q: string) => ["nd", "search", q] as const,
};
```

Для remote-запросов `staleTime: 5 мин`; `refetchOnWindowFocus: false` глобально уже стоит — не трогаем.

**Страницы.** Источник страниц библиотеки берётся из dropdown в хедере сайдбара (store `currentSource`) — компонент и store делаются в M2. Не путать с уже существующим переключателем источника **поиска** в `SidebarHeader` (library/youtube, из wip-коммита) — это отдельная ось, она остаётся как есть. Страница выбирает data-path по источнику; компоненты потребляют нормализованные VM (DTO выше им достаточно), ветвления в шаблонах нет. Пагинация ND-альбомов (`getAlbumList2`, `size ≤ 500`, `offset`) — существующий infinite-паттерн один в один.

`AllMusicPage` и liked в ND-режиме скрыты (решение M2): у Subsonic нет «всех треков», а `search3` с пустым query — рискованная Navidrome-специфика (§13).

**Поиск.** Мультиисточниковый, секциями по источнику (локальный minisearch + `search3` + YT), без сквозного ранжирования — честно смешать скоры minisearch и API нельзя. Источники — тем же dropdown-паттерном.

**ND-плейлисты** — read-only live-страницы (в Dexie не попадают). На каждом треке — play/queue/«в локальный плейлист» (pin) /«скачать».

---

## 6. Контекстные меню и действия

Текущая система фиксируется как основа — миграции на декларативную схему-реестр **не будет**: реестру нужен escape-hatch для половины пунктов (сабменю плейлистов, кастомная разметка item'ов), он обесценивает написанные тесты автозакрытия и ломает рабочий паттерн ради красоты. Сохраняются все три семейства:

- трековые меню: `modules/tracks/components/menu` — shell'ы `TrackContextMenu`/`TrackDropdown`, инъекция комплекта reka-компонентов (`useTrackMenuComponents`), контексты в `contexts/*`, переиспользуемые item-компоненты, синглтон `useTrackMenu`, действия `useTrackContextActions` → `ContextActions`;
- media-hero меню (альбом/артист/плейлист/liked) — тот же паттерн;
- sidebar-меню (`modules/library`).

**Принцип двух осей.** Вся source-зависимость раскладывается так, чтобы матрица «9 контекстов × 3 источника × pinned/offline» не существовала:

- **Контекст** (`TrackContext`) отвечает за «ГДЕ открыто меню» — пункты про окружение (`removeFromQueue/-Playlist/-History`, `isOwner`). Ось не расширяется под новые источники: read-only плейлист ND = `playlist` с `isOwner=false`, ND-браузинг = `default`. Существующие `yt`/`yt-search` легитимно отдельные (обе поверхности могут быть смонтированы одновременно) — остаются как есть, их пересмотр — M5.
- **Capabilities** отвечают за «ЧТО можно с этим субъектом» — источник, pinned, оффлайн-копия, платформа. Контекстные компоненты источник напрямую не проверяют никогда.

### Субъект меню

Меню открываются не только для библиотечных `Track`, но и для незакреплённых DTO с live-страниц и эфемерных треков:

```ts
export type TrackMenuSubject =
  | { kind: "library"; track: Track }
  | { kind: "remote"; dto: SourceTrackDTO }      // ещё не pinned (ND-браузинг, YT-поиск)
  | { kind: "ephemeral"; track: EphemeralTrack }; // open-with, текущий трек

// useTrackMenu: activeTrack → Ref<TrackMenuSubject | null>;
// адаптер-перегрузка для существующих вызовов с Track — старые call-sites не переписываются разом.
```

### Capabilities

Синхронная часть считается из субъекта, асинхронная (оффлайн-копия) — query `offlineCopy(trackId)` с cache-sync из download-менеджера:

```ts
export interface TrackMenuCaps {
  source: SourceKind;
  isInLibrary: boolean;     // library-строка с pinned = 1
  isPinned: boolean;        // строка в Dexie есть (включая shadow)
  hasOfflineCopy: boolean;  // из query
  canExportFile: boolean;   // локальный файл ИЛИ оффлайн-копия → «Сохранить как…»
  canOffline: boolean;      // sources.forTrack(id).capabilities.download && !hasOfflineCopy
  canAttachLyrics: boolean; // только library-строка (лирика хранится локально у pinned)
  canOpenExternal: boolean; // yt / nd
}
export function useTrackMenuCaps(subject: Ref<TrackMenuSubject | null>): Ref<TrackMenuCaps>;
```

Shell считает caps один раз для активного субъекта и передаёт вниз рядом с `actions`; item-компоненты получают готовые булевы. `trackPredicates` расширяется до source-aware, не дублируется.

### Действия

`ContextActions` расширяется аддитивно — существующие контексты не переписываются. Ключевой мост:

```ts
// внутренняя утилита actions-слоя, НЕ пункт меню
ensurePinned(subject: TrackMenuSubject): Promise<Track>
// remote-DTO → pin-каскад через unitOfWork → Track; library → как есть
```

Любое действие, требующее строки в БД (`toggleLike`, `addToPlaylist`, `attachLyrics`, оффлайн), внутри вызывает `ensurePinned` — «лайк из ND-браузинга» просто работает, меню не различает pinned/непинned. Воспроизведение из браузинга — shadow-pin (§1).

| Действие | Поведение |
|---|---|
| `addToLibrary` | pin с `pinned = 1`; виден при remote-источнике и `!isInLibrary` |
| `removeFromLibrary` | remote-аналог «Удалить трек»: каскад из плейлистов/лайков + удаление оффлайн-копии, строка деградирует в shadow (история живёт); строго через UoW |
| `downloadOffline` / `removeOfflineCopy` | постановка job в download-менеджер / удаление копии; один item с тремя состояниями: скачать → прогресс → удалить копию |
| `exportFile` («Сохранить как…») | бывший `download`; сейчас читает `track.storagePath` напрямую и **молча сломается на remote-треках** — в M1 переводится на `canExportFile` + чтение локального файла или оффлайн-копии |
| `openExternal` | yt → `youtube.com/watch?v=…`, nd → страница на сервере; через `plugin-opener` |
| `goToArtist` / `goToAlbum` | сигнатуры без изменений: `routeLocation` принимает префиксованные ID, страница выбирает data-path по префиксу (§5) |

Батч-выделение смешанных источников: меню показывает пересечение caps (паттерн `canDownloadTrack(Track[])` сохраняется).

### Media-hero и sidebar

`useMediaContext` получает те же расширения на уровне сущностей: ND-альбом/плейлист — play/queue (shadow-pin треков), «Скачать альбом/плейлист» (batch), «Добавить альбом в библиотеку» (pin всех треков; у артиста такого пункта нет — артист закрепляется каскадом от треков, у ND-плейлиста пункта импорта нет). Sidebar-меню в M1–M2 не трогаются: там живут только pinned-сущности, им хватает существующего набора + `removeFromLibrary`.

### Мобильные меню

Без изменений — bottom-sheet-таргет решено **не делать**, текущие меню на таче устраивают. Если решение когда-нибудь изменится, инъекция комплектов остаётся готовой точкой расширения; в скоуп не входит.

---

## 7. Navidrome / Subsonic

**Клиент** (`modules/sources/navidrome/api`): обёртка `subsonicFetch<T>(endpoint, params)` → `ResultAsync`, парсит envelope `subsonic-response`, мапит коды (40/41 → `AUTH`, 70 → `NOT_FOUND`, 0 → `UNKNOWN`).

Транспорт JSON-вызовов — `tauri-plugin-http` (добавить): fetch на стороне Rust, CORS не существует. ND-источник в web/PWA-сборке = `noopProvider` (тот же паттерн, что YT): дырку с CORS у чужого сервера в браузере не чиним.

Параметры каждого запроса: `u`, `t = md5(password + salt)`, `s` (свежий salt), `v=1.16.1`, `c=audiogram`, `f=json`.

| Нужда | Endpoint |
|---|---|
| Health / проверка креды | `ping` |
| Артисты (весь индекс одним запросом, учесть `ignoredArticles`) | `getArtists` |
| Альбомы артиста | `getArtist` |
| Лента альбомов (пагинация) | `getAlbumList2` (`alphabeticalByName` / `newest`) |
| Альбом с треками | `getAlbum` |
| Плейлисты | `getPlaylists`, `getPlaylist` |
| Поиск | `search3` |
| Обложки | `getCoverArt` (+`size`) — только через прокси |
| Стрим | `stream` + `format=raw` — только через прокси |

Стриминг и обложки в webview напрямую не ходят никогда — см. §8.

**Креды.** Хранятся просто (настройки, как решили), но при старте/изменении один раз отдаются в Rust (`nd_set_config`). Дальше токен собирается в Rust — не светится в `src` медиа-элементов, DevTools network и логах. Обложки через прокси → canvas не тейнтится → извлечение палитры (`lib/color`) работает без изменений.

**Настройки:** страница источников — `{ baseUrl, username, password, enabled }` + кнопка «проверить» (`ping`).

---

## 8. Rust: обобщённый прокси `stream://`

`ytstream://` обобщается до одной схемы с диспетчеризацией по префиксу пути (Range-форвардинг и ре-резолв уже написаны — переезжают как есть):

```
stream://localhost/yt/<videoId>                  ← перенос ytstream:// (кэш резолва, retry на 403)
stream://localhost/nd/song/<songId>              → GET {base}/rest/stream.view?id=…&format=raw&{auth}
stream://localhost/nd/cover/<coverId>?size=<px>  → GET {base}/rest/getCoverArt.view?…
```

Требования к обработчику: форвард `Range` → апстрим, прокидывание `Content-Type`/`Content-Range`/`Accept-Ranges`, `Access-Control-Allow-Origin: *` в ответе (fetch/canvas из webview), апстрим 4xx/5xx → 502 + лог. Стейт: `tauri::State<RwLock<Option<NdConfig>>>`, команда `nd_set_config { base_url, username, password }`.

Команда загрузки: `nd_download { song_id } → путь во временном каталоге` + progress-канал **того же контракта, что `YtDownloadEvent`** — download-менеджеру всё равно, какой источник качает.

Frontend получает URL через `convertFileSrc(path, "stream")` — на Android схема автоматически мапится в `https://stream.localhost/…`.

Переезд схемы: персистированная очередь хранит ephemeral-YT-треки с `ytstream`-URL (`PersistedEphemeralTrack`; URL собирается в `useYoutube.ts`) — при restore выполняется **одноразовая строковая миграция** на `stream://…/yt/…`; legacy-алиас схемы не оставляем. Упоминания `ytstream` в `modules/youtube/lib/playable.ts` (проверка `url.includes("ytstream")`) и `modules/settings/*/proxy.ts` правятся тем же шагом. `ytimg://`-прокси обложек остаётся как есть — в скоуп не входит.

---

## 9. Download-менеджер (`modules/downloads`)

- Персист: `downloadJobs` (Dexie) — очередь переживает рестарт; рантайм-прогресс — Pinia store.
- Воркер-цикл: `p-limit(2–3)`, ретраи `attempts < 3` с бэкоффом, `status`-переходы атомарно.
- Batch: «скачать альбом/плейлист» → `provider.getAlbum/getPlaylist` → pin всех треков → jobs с общим `batchId`.
- Успех: файл → `IFileStorage.importFile` в `offline/<source>/<trackId>.<ext>` → `offlineCopies.put` → cache-sync затронутых query-кэшей (не тотальный invalidate).
- Интеграция со `storage-info.service`: размер оффлайн-кэша + «очистить оффлайн» (чистит копии и файлы, треки остаются).
- Батчи не переживают рестарт приложения: джобы резюмятся поштучно, batchId-агрегация прогресса живёт только в памяти — осознанное ограничение v1.
- Чистка джоб: done-джоба удаляется сразу при финализации (учёт готового — `offlineCopies`), error-джоба остаётся до повторной постановки; терминальная ошибка после исчерпания ретраев показывается toast'ом.
- YT переезжает сюда же: `provider.downloadToFile` = существующий `yt_download`; старый путь «download → import-pipeline» упраздняется (уже скачанное — обычные локальные треки, их не трогаем).

---

## 10. Open with

**Десктоп (M3):** фактически уже в коде: `fileAssociations` в `tauri.conf.json`, argv через подключённый `single-instance` + первый запуск в `setup`, фронт слушает открытие файлов → `ephemeralFromPath` → воспроизведение. Остаётся одно: явная CTA «Импортировать» на ephemeral-треке (существующий import-pipeline). Авто-импорта нет.

**Android (M6):** intent-filter `ACTION_VIEW` (audio/*) + перехват в MainActivity/onNewIntent → мостик в Rust/JS; чтение `content://` через SAF. Готового плагина нет — отдельный милстоун, в M1–M5 не тащить.

---

## 11. Слияние альбомов local + ND (M6)

Вариант «б» уже исключает главный источник дублей. Остаётся «альбом импортирован локально И есть на сервере»:

- Автосклейка **только по MusicBrainz ID**: Navidrome отдаёт `musicBrainzId` в Subsonic-ответах, `music-metadata` достаёт MBID из локальных тегов. Совпадение — стопроцентное.
- Остальное — ручное действие «Связать с альбомом…». Никакого fuzzy-авто: делюксы/ремастеры/сборники дают ложные склейки.
- Схема: `entityLinks { id, kind: "album" | "artist", localId, remoteId, confidence: "mbid" | "manual" }` — чисто аддитивно.
- Страница связанного альбома: объединение треков; при track-level совпадении (MBID, либо title + duration ± 2 c + trackNo) играется локальный/оффлайн вариант.

---

## 12. Милстоуны

**M1 — фундамент.** `TrackRef` + фабрики ID; миграция схемы (§3); контракт + реестр `sources` (+ адаптер существующего YT-провайдера); рефактор плеера на единый `resolvePlayback`; обобщение `ytstream://` → `stream://` (YT переезжает первым — регресс-проверка прокси до появления ND). Меню: `TrackMenuSubject` + caps-слой + `ensurePinned`; починка `exportFile` (прямое чтение `storagePath` умрёт на remote); item'ы `addToLibrary` / `removeFromLibrary` / `openExternal`.

**M2 — Navidrome, чтение.** Настройки + `nd_set_config` + `ping`; SubsonicClient (`tauri-plugin-http`); NdProvider; страницы артисты/альбомы/альбом/плейлисты в ND-режиме; dropdown источника в хедере сайдбара + store `currentSource` (делается здесь); обложки через прокси (проверить палитру); `search3` в мультипоиске; play/queue из браузинга (shadow-pin); pin-действия (лайк / в плейлист) с каскадом через UoW; трековые меню на ND-страницах (те же контексты, `playlist` c `isOwner=false` для read-only), media-hero меню ND-альбома/плейлиста (play/queue); пересчёт `pinned` у альбома/артиста при `removeFromLibrary` (иначе альбомы-призраки после удаления последнего library-трека).

**M3 — Open with, десктоп.** Почти готов в коде (ассоциации, argv, ephemeral-проигрывание); остаётся CTA «Импортировать».

**M4 — Оффлайн.** Download-менеджер, `nd_download`, batch по альбому/плейлисту, storage-настройки, приоритет оффлайн-копии в резолве. Оффлайн-item в трековом меню (3 состояния) + batch-пункты «скачать альбом/плейлист» в media-hero меню.

**M5 — YT в библиотеке.** Pin из поиска; YT-скачивание переезжает на общий механизм (б); Android-флаг для YT (rustypipe собирается — включить и проверить). Перевод yt/yt-search-меню на `TrackMenuSubject`/caps; схлопывать ли эти контексты в `default`/`search` — решается здесь.

**M6 — добивка.** Радио → источник (`RadioStationEntity` уходит под общий контракт, `REMOTE_HLS` из TrackSource выпиливается); `entityLinks` + ручная связка альбомов; Android open-with.

---

## 13. Риски

- **Range через кастомную схему на Android** — на десктопе работает (ytstream), на Android-webview проверить перемотку на девайсе в M5, до включения ND/YT на мобилке.
- **rustypipe / reqwest+rustls под aarch64-linux-android** — должно собираться (чистый Rust), но проверка сборки — до обещаний YT на Android.
- **Self-signed HTTPS у домашнего Navidrome** — rustls такое не ест; либо опция «доверять сертификату» в конфиге прокси, либо честный ответ «ставь нормальный серт» в доке настроек.
- **`search3` с пустым query** — поведение Navidrome-специфично; если ляжет в основу AllMusicPage — покрыть проверкой на `ping`-этапе.
- **Каскады pin/unpin мимо UoW** — та же мина, что существующий баг cascade-delete; в M1 ревью на этот инвариант обязателен.