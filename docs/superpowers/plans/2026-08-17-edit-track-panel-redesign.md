# EditTrackPanel v2 + EntitySelectPanel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переписать панель редактирования трека на переиспользуемый generic-пикер сущностей, выделенный из AddTracksPanel.

**Architecture:** `EntitySelectPanel` — презентационная оболочка «шапка + поиск + виртуальный список + строка „Создать X" + FAB»; выбор и данные полностью у родителя (через слот `#row` и события). `AddTracksPanel` переводится на неё 1:1. Артисты/альбом в форме редактирования выбираются в этой панели (right-panel view `entity-select`, depth 3), результат возвращается колбэком в payload. Debounce поиска — на стороне родителя (`refDebounced`), панель эмитит сырой ввод.

**Tech Stack:** Vue 3 `<script setup lang="ts" generic="T">`, TanStack Query 5, vee-validate + valibot, vitest + @testing-library/vue, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-08-17-edit-track-panel-redesign-design.md`

## Global Constraints

- Кодстайл проекта: функции только `const fn = () => {}` (не `function fn() {}`).
- Никаких HTML-комментариев внутри `<template>` .vue-файлов.
- Никаких Co-Authored-By/Claude в коммитах.
- После каждой задачи зелёные: `npm run type-check`, `npx eslint --fix <изменённые файлы>`, `npx vitest run <затронутые тесты>`.
- Тексты — в обе локали (`src/app/i18n/locales/ru/*`, `en/*`).
- Тестовые файлы в репо игнорируются eslint'ом — предупреждение «File ignored» это норма.

---

### Task 1: EntitySelectPanel (generic-оболочка) + тест

**Files:**
- Create: `src/components/entity-select/EntitySelectPanel.vue`
- Create: `src/components/entity-select/index.ts`
- Test: `src/components/entity-select/__tests__/EntitySelectPanel.test.ts`

**Interfaces:**
- Produces (используют Task 2/3):
  - props: `title: string`, `items: T[]`, `getKey: (item: T) => string`,
    `search: string` (v-model), `isLoading?: boolean`, `itemHeight?: number` (default 64),
    `canCreate?: boolean`, `createLabel?: string`, `confirmCount?: number` (FAB виден при > 0),
    `showBack?: boolean`
  - emits: `update:search [string]`, `confirm []`, `create [string]` (нормализованное имя из поиска),
    `loadMore []`, `back []`, `close []`
  - slot: `#row="{ item, index }"`, slot `#empty` (дефолт `Empty`+`EmptyDescription` c `common.empty`)
  - expose: `listEl: Ref<HTMLElement | null>` (для drag-выделения в Task 2)

- [ ] **Step 1: Написать падающий тест**

```ts
// src/components/entity-select/__tests__/EntitySelectPanel.test.ts
import { render, fireEvent } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { i18n } from "@/app/i18n";
import EntitySelectPanel from "../EntitySelectPanel.vue";

const VirtualScrollableStub = {
  props: ["items"],
  template: `
    <div>
      <template v-if="items.length">
        <div v-for="(item, index) in items" :key="index">
          <slot :item="item" :index="index" />
        </div>
      </template>
      <slot v-else name="empty" />
    </div>`,
};

const stubs = {
  RightPanelHeader: true,
  VirtualScrollable: VirtualScrollableStub,
  AddFloatingButton: {
    props: ["count", "show"],
    template: `<button v-if="show" data-testid="fab" @click="$emit('click')">{{ count }}</button>`,
  },
};

const renderPanel = (props: Record<string, unknown> = {}) =>
  render(EntitySelectPanel, {
    props: {
      title: "T",
      items: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }],
      getKey: (item: { id: string }) => item.id,
      search: "",
      ...props,
    },
    slots: { row: `<template #row="{ item }"><span data-testid="row">{{ item.name }}</span></template>` },
    global: { plugins: [i18n], stubs },
  });

describe("EntitySelectPanel", () => {
  it("renders rows through the #row slot", () => {
    const { getAllByTestId } = renderPanel();
    expect(getAllByTestId("row")).toHaveLength(2);
  });

  it("emits update:search on typing", async () => {
    const { container, emitted } = renderPanel();
    const input = container.querySelector("input")!;
    await fireEvent.update(input, "abc");
    expect(emitted("update:search")?.at(-1)).toEqual(["abc"]);
  });

  it("shows the create row only when canCreate and search is non-empty, click emits create", async () => {
    const { queryByTestId, getByTestId, emitted, rerender } = renderPanel({ canCreate: true, search: "" });
    expect(queryByTestId("create-row")).toBeNull();
    await rerender({ canCreate: true, search: "  New  Name " });
    await fireEvent.click(getByTestId("create-row"));
    expect(emitted("create")?.[0]).toEqual(["New Name"]);
  });

  it("FAB is hidden at confirmCount 0 and emits confirm on click otherwise", async () => {
    const { queryByTestId, getByTestId, emitted, rerender } = renderPanel({ confirmCount: 0 });
    expect(queryByTestId("fab")).toBeNull();
    await rerender({ confirmCount: 3 });
    await fireEvent.click(getByTestId("fab"));
    expect(emitted("confirm")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Прогнать — убедиться, что падает**

Run: `npx vitest run src/components/entity-select/__tests__/EntitySelectPanel.test.ts`
Expected: FAIL (component not found).

- [ ] **Step 3: Реализовать компонент**

```vue
<!-- src/components/entity-select/EntitySelectPanel.vue -->
<template>
  <div class="relative flex h-full w-full flex-col overflow-hidden bg-card">
    <RightPanelHeader
      :title="title"
      :description="null"
      :show-back="showBack"
      @back="emit('back')"
      @close="emit('close')"
    />

    <div class="bg-card px-4 pb-2">
      <InputGroup class="flex-1 bg-background! rounded-full">
        <InputGroupInput
          :model-value="search"
          class="pl-3! text-[15px]"
          :placeholder="t('search.placeholder')"
          @keydown.stop
          @update:model-value="emit('update:search', String($event))"
        />
        <InputGroupAddon
          v-if="search.trim()"
          tabindex="-1"
          align="inline-end"
        >
          <Button
            class="rounded-full"
            variant="ghost-primary"
            size="icon-sm"
            @click="emit('update:search', '')"
          >
            <IconX class="size-5" />
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>

    <div
      ref="listEl"
      class="relative min-h-0 flex-1 overflow-hidden"
    >
      <VirtualScrollable
        :items="items"
        :get-item-key="keyAt"
        :item-height="itemHeight"
        :load-more-offset="160"
        :padding-bottom="8"
        :loading="isLoading"
        class="h-full"
        @load-more="emit('loadMore')"
      >
        <template #default="{ item, index }">
          <div class="px-2">
            <slot
              name="row"
              :item="item"
              :index="index"
            />
          </div>
        </template>

        <template #empty>
          <slot name="empty">
            <Empty class="p-4 py-8 md:p-4 md:py-8">
              <EmptyDescription>{{ t("common.empty") }}</EmptyDescription>
            </Empty>
          </slot>
        </template>
      </VirtualScrollable>

      <div
        v-if="showCreateRow"
        class="absolute inset-x-0 bottom-0 border-t border-border bg-card p-2"
      >
        <Item
          as="button"
          type="button"
          data-testid="create-row"
          class="w-full cursor-pointer gap-2 px-3 py-2 text-left text-primary"
          @click="emit('create', normalizedSearch)"
        >
          <IconPlus class="size-5" />
          <span class="truncate">{{ createLabel ?? t("entitySelect.create", { name: normalizedSearch }) }}</span>
        </Item>
      </div>

      <AddFloatingButton
        :count="confirmCount ?? 0"
        :show="(confirmCount ?? 0) > 0"
        @click="emit('confirm')"
      />
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import { computed, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item } from "@/components/ui/item";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import RightPanelHeader from "@/modules/right-panel/components/RightPanelHeader.vue";
import AddFloatingButton from "@/modules/tracks/components/tracks-sheet/AddFloatingButton.vue";
import IconPlus from "~icons/tabler/plus";
import IconX from "~icons/tabler/x";

const props = withDefaults(defineProps<{
  title: string;
  items: T[];
  getKey: (item: T) => string;
  search: string;
  isLoading?: boolean;
  itemHeight?: number;
  canCreate?: boolean;
  createLabel?: string;
  confirmCount?: number;
  showBack?: boolean;
}>(), {
  isLoading: false,
  itemHeight: 64,
  canCreate: false,
  createLabel: undefined,
  confirmCount: 0,
  showBack: true,
});

const emit = defineEmits<{
  "update:search": [value: string];
  "confirm": [];
  "create": [name: string];
  "loadMore": [];
  "back": [];
  "close": [];
}>();

const { t } = useI18n();

const listEl = useTemplateRef<HTMLElement>("listEl");
defineExpose({ listEl });

const keyAt = (index: number) => {
  const item = props.items[index];
  return item ? props.getKey(item) : index;
};

const normalizedSearch = computed(() => props.search.trim().replace(/\s+/g, " "));
const showCreateRow = computed(() => props.canCreate && normalizedSearch.value.length > 0);
</script>
```

```ts
// src/components/entity-select/index.ts
export { default as EntitySelectPanel } from "./EntitySelectPanel.vue";
```

- [ ] **Step 4: i18n-ключи**

В `src/app/i18n/locales/ru/common.json`: `"entitySelect": { "create": "Создать «{name}»" }`.
В `en/common.json`: `"entitySelect": { "create": "Create \"{name}\"" }`.
Если в common.json нет корня для вложенных ключей — положить рядом с существующими ключами верхнего уровня.

- [ ] **Step 5: Прогнать тест — зелёный**

Run: `npx vitest run src/components/entity-select/__tests__/EntitySelectPanel.test.ts`
Expected: PASS. Затем `npx eslint --fix src/components/entity-select/EntitySelectPanel.vue src/components/entity-select/index.ts` и `npm run type-check`.

- [ ] **Step 6: Commit**

```bash
git add src/components/entity-select src/app/i18n/locales/ru/common.json src/app/i18n/locales/en/common.json
git commit -m "feat(entity-select): generic search+list+select panel shell"
```

---

### Task 2: Перевести AddTracksPanel на EntitySelectPanel

**Files:**
- Modify: `src/modules/tracks/components/tracks-sheet/AddTracksPanel.vue`

**Interfaces:**
- Consumes: `EntitySelectPanel` из Task 1 (props/emits/expose как описано там).
- Produces: поведение панели не меняется — это чистый рефакторинг.

- [ ] **Step 1: Заменить шаблон**

Весь `<template>` AddTracksPanel заменить на:

```vue
<template>
  <EntitySelectPanel
    ref="panelRef"
    v-model:search="searchInput"
    :title="title"
    :items="tracks"
    :get-key="(track: Track) => track.id"
    :is-loading="isInitialLoading"
    :confirm-count="selectedCount"
    :show-back="rightPanel.depth > 0"
    @confirm="handleConfirm"
    @load-more="handleLoadMore"
    @back="handleBack"
    @close="closePanel"
  >
    <template #row="{ item, index }">
      <TrackSelectRow
        :track="item"
        :index="index"
        :is-selected="isTrackSelected(item.id)"
        @toggle-select="toggleTrackSelect"
      />
    </template>

    <template #empty>
      <Empty class="p-4 py-8 md:p-4 md:py-8">
        <EmptyDescription>{{ emptyLabel }}</EmptyDescription>
      </Empty>
    </template>
  </EntitySelectPanel>
</template>
```

- [ ] **Step 2: Обновить script**

- Импортировать `EntitySelectPanel` и тип `Track` (`@/modules/player/types`), удалить импорты, ставшие лишними: `InputGroup*`, `Button`, `IconX`, `VirtualScrollable`, `RightPanelHeader`, `AddFloatingButton`, `TrackRowLoading`.
- Заменить `tracksListRef` на ref к панели и её exposed `listEl`:

```ts
const panelRef = useTemplateRef<InstanceType<typeof EntitySelectPanel>>("panelRef");

watch(
  () => panelRef.value?.listEl ?? null,
  (el, _prev, onCleanup) => {
    if (!el) return;
    const cleanup = attachDragListeners(el, {
      rowSelector: "[data-track-id]",
      idDataKey: "trackId",
      indexDataKey: "trackIndex",
    });
    onCleanup(cleanup);
  },
  { flush: "post" },
);
```

Остальная логика (queries, useSelection, мутации, `handleConfirm`, `resetState`) не меняется. `getTrackKey` больше не нужен — удалить.

- [ ] **Step 3: Проверить**

Run: `npm run type-check; npx eslint --fix src/modules/tracks/components/tracks-sheet/AddTracksPanel.vue; npx vitest run src/modules/tracks/ src/modules/right-panel/`
Expected: всё зелёное. Затем руками в dev: открыть плейлист → «Добавить треки» → поиск, мультиселект (клик и drag), FAB, добавление работает как раньше.

- [ ] **Step 4: Commit**

```bash
git add src/modules/tracks/components/tracks-sheet/AddTracksPanel.vue
git commit -m "refactor(tracks-sheet): AddTracksPanel on EntitySelectPanel shell"
```

---

### Task 3: View `entity-select`, пикеры артистов и альбома

**Files:**
- Modify: `src/modules/right-panel/types.ts`
- Modify: `src/modules/right-panel/store/right-panel.store.ts`
- Modify: `src/modules/right-panel/components/RightPanelHost.vue`
- Create: `src/modules/right-panel/components/panels/EntitySelectView.vue`
- Create: `src/modules/tracks/components/edit/ArtistSelectPanel.vue`
- Create: `src/modules/tracks/components/edit/AlbumSelectPanel.vue`

**Interfaces:**
- Consumes: `EntitySelectPanel` (Task 1), `searchArtists(query, limit)` из `@/queries/artist.queries`, `searchAlbums(query)` из `@/queries/album.queries`.
- Produces (использует Task 5):

```ts
// types.ts
export interface RightPanelEntitySelectPayload {
  kind: "artists" | "album";
  selectedNames?: string[];
  selectedAlbumId?: string;
  onConfirm: (result: { names?: string[]; albumId?: string; albumTitle?: string }) => void;
}
```

  и метод стора `openEntitySelect(payload, options?)` (depth default 3).

- [ ] **Step 1: types.ts**

Добавить `"entity-select"` в `RightPanelView`, интерфейс `RightPanelEntitySelectPayload` (выше) и `"entity-select": RightPanelEntitySelectPayload;` в `RightPanelPayloadMap`.

- [ ] **Step 2: store**

По образцу `openAddTracks`:

```ts
const openEntitySelect = (
  nextPayload: RightPanelPayloadMap["entity-select"],
  options: OpenRightPanelOptions = {},
): void => {
  open("entity-select", nextPayload, { ...options, depth: options.depth ?? 3 });
};
```

(в файле стора функции объявлены через `function` — новый метод писать стрелкой, вернуть его из стора рядом с `openAddTracks`).

- [ ] **Step 3: EntitySelectView — свитч по kind**

```vue
<!-- src/modules/right-panel/components/panels/EntitySelectView.vue -->
<template>
  <ArtistSelectPanel
    v-if="payload.kind === 'artists'"
    :payload="payload"
  />
  <AlbumSelectPanel
    v-else
    :payload="payload"
  />
</template>

<script setup lang="ts">
import type { RightPanelEntitySelectPayload } from "@/modules/right-panel/types";
import ArtistSelectPanel from "@/modules/tracks/components/edit/ArtistSelectPanel.vue";
import AlbumSelectPanel from "@/modules/tracks/components/edit/AlbumSelectPanel.vue";

defineProps<{ payload: RightPanelEntitySelectPayload }>();
</script>
```

В `RightPanelHost.vue` — по образцу `AddTracksPanel`: импорт `EntitySelectView` и ветка `case "entity-select": return EntitySelectView;` в маппинге view → компонент (payload прокидывается тем же механизмом, что у `add-tracks`).

- [ ] **Step 4: ArtistSelectPanel (мультиселект по именам)**

```vue
<!-- src/modules/tracks/components/edit/ArtistSelectPanel.vue -->
<template>
  <EntitySelectPanel
    v-model:search="search"
    :title="t('track.edit.selectArtists')"
    :items="suggestions"
    :get-key="(artist: ArtistEntity) => artist.id"
    :can-create="canCreate"
    :confirm-count="selectedNames.length"
    @confirm="handleConfirm"
    @create="handleCreate"
    @back="rightPanel.back()"
    @close="rightPanel.close()"
  >
    <template #row="{ item }">
      <Item
        as="button"
        type="button"
        class="w-full cursor-pointer gap-3 px-2 py-2 text-left"
        @click="toggleName(item.name)"
      >
        <ItemMedia>
          <EntityCoverImage
            owner-type="artist"
            :owner-id="item.id"
            :alt="item.name"
            image-class="size-10 rounded-full object-cover"
          />
        </ItemMedia>
        <ItemContent class="min-w-0">
          <ItemTitle class="w-full text-sm font-normal">
            <span class="min-w-0 truncate">{{ item.name }}</span>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <IconCheck
            v-if="isSelectedName(item.name)"
            class="size-5 text-primary"
          />
        </ItemActions>
      </Item>
    </template>
  </EntitySelectPanel>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { refDebounced } from "@vueuse/core";
import { useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";
import { EntitySelectPanel } from "@/components/entity-select";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import type { ArtistEntity } from "@/db/entities";
import { searchArtists } from "@/queries/artist.queries";
import { queryKeys } from "@/queries/query-keys";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { RightPanelEntitySelectPayload } from "@/modules/right-panel/types";
import IconCheck from "~icons/tabler/check";

const props = defineProps<{ payload: RightPanelEntitySelectPayload }>();

const { t } = useI18n();
const rightPanel = useRightPanelStore();

const search = ref("");
const debouncedSearch = refDebounced(search, 200);
const normalizedSearch = computed(() => debouncedSearch.value.trim().replace(/\s+/g, " "));

const selectedNames = ref<string[]>([...(props.payload.selectedNames ?? [])]);
const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const isSelectedName = (name: string) => selectedNames.value.some(item => nameKey(item) === nameKey(name));

const toggleName = (name: string) => {
  selectedNames.value = isSelectedName(name)
    ? selectedNames.value.filter(item => nameKey(item) !== nameKey(name))
    : [...selectedNames.value, name];
};

const { data } = useQuery({
  queryKey: computed(() => queryKeys.artists.search(normalizedSearch.value)),
  queryFn: () => searchArtists(normalizedSearch.value, 30),
});
const suggestions = computed(() => data.value ?? []);

const canCreate = computed(() =>
  normalizedSearch.value.length > 0
  && !suggestions.value.some(artist => nameKey(artist.name) === nameKey(normalizedSearch.value)),
);

const handleCreate = (name: string) => {
  if (!isSelectedName(name)) selectedNames.value = [...selectedNames.value, name];
  search.value = "";
};

const handleConfirm = () => {
  props.payload.onConfirm({ names: [...selectedNames.value] });
  rightPanel.back();
};
</script>
```

- [ ] **Step 5: AlbumSelectPanel (сингл, подтверждение по клику)**

```vue
<!-- src/modules/tracks/components/edit/AlbumSelectPanel.vue -->
<template>
  <EntitySelectPanel
    v-model:search="search"
    :title="t('track.edit.selectAlbum')"
    :items="suggestions"
    :get-key="(album: AlbumEntity) => album.id"
    :can-create="canCreate"
    @create="handleCreate"
    @back="rightPanel.back()"
    @close="rightPanel.close()"
  >
    <template #row="{ item }">
      <Item
        as="button"
        type="button"
        class="w-full cursor-pointer gap-3 px-2 py-2 text-left"
        @click="handleSelect(item)"
      >
        <ItemMedia>
          <EntityCoverImage
            owner-type="album"
            :owner-id="item.id"
            :alt="item.title"
            image-class="size-10 rounded-md object-cover"
          />
        </ItemMedia>
        <ItemContent class="min-w-0">
          <ItemTitle class="w-full text-sm font-normal">
            <span class="min-w-0 truncate">{{ item.title }}</span>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <IconCheck
            v-if="item.id === payload.selectedAlbumId"
            class="size-5 text-primary"
          />
        </ItemActions>
      </Item>
    </template>
  </EntitySelectPanel>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { refDebounced } from "@vueuse/core";
import { useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";
import { EntitySelectPanel } from "@/components/entity-select";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import type { AlbumEntity } from "@/db/entities";
import { searchAlbums } from "@/queries/album.queries";
import { queryKeys } from "@/queries/query-keys";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { RightPanelEntitySelectPayload } from "@/modules/right-panel/types";
import IconCheck from "~icons/tabler/check";

const props = defineProps<{ payload: RightPanelEntitySelectPayload }>();

const { t } = useI18n();
const rightPanel = useRightPanelStore();

const search = ref("");
const debouncedSearch = refDebounced(search, 200);
const normalizedSearch = computed(() => debouncedSearch.value.trim().replace(/\s+/g, " "));

const { data } = useQuery({
  queryKey: computed(() => queryKeys.albums.search(normalizedSearch.value)),
  queryFn: () => searchAlbums(normalizedSearch.value),
});
const suggestions = computed(() => data.value ?? []);

const titleKey = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();
const canCreate = computed(() =>
  normalizedSearch.value.length > 0
  && !suggestions.value.some(album => titleKey(album.title) === titleKey(normalizedSearch.value)),
);

const handleSelect = (album: AlbumEntity) => {
  props.payload.onConfirm({ albumId: album.id });
  rightPanel.back();
};

const handleCreate = (title: string) => {
  props.payload.onConfirm({ albumTitle: title });
  rightPanel.back();
};
</script>
```

- [ ] **Step 6: i18n**

`ru/track.json` → в `edit`: `"selectArtists": "Выбор артистов"`, `"selectAlbum": "Выбор альбома"`.
`en/track.json` → `"selectArtists": "Select artists"`, `"selectAlbum": "Select album"`.

- [ ] **Step 7: Проверить и закоммитить**

Run: `npm run type-check; npx eslint --fix <созданные/изменённые файлы>; npx vitest run src/modules/right-panel/`
Expected: зелёное (панели ещё ниоткуда не открываются — интеграция в Task 5).

```bash
git add src/modules/right-panel src/modules/tracks/components/edit src/app/i18n/locales
git commit -m "feat(right-panel): entity-select view with artist/album pickers"
```

---

### Task 4: updateTrackMetadataAndSync — создание альбома по названию

**Files:**
- Modify: `src/services/entity-resolver.ts` (экспортировать `identityKey`)
- Modify: `src/queries/track.queries.ts`
- Test: `src/queries/__tests__/track-queries.test.ts` (добавить кейсы)

**Interfaces:**
- Produces (использует Task 5): `TrackMetadataChanges` становится

```ts
export interface TrackMetadataChanges {
  title: string;
  artistNames: string[];
  albumId?: AlbumId;
  albumTitle?: string; // ровно одно из albumId/albumTitle обязано быть задано
  trackNo?: number;
  diskNo?: number;
}
```

- [ ] **Step 1: Экспортировать identityKey**

В `src/services/entity-resolver.ts` заменить `function identityKey` на `export function identityKey` (сигнатура и тело не меняются; JSDoc остаётся).

- [ ] **Step 2: Написать падающие тесты**

В `src/queries/__tests__/track-queries.test.ts` (файл существует, использует fake-indexeddb — следовать его сеттингу и хелперам создания трека/альбома/артиста) добавить:

```ts
describe("updateTrackMetadataAndSync album by title", () => {
  it("reuses an existing album of the first artist matched case-insensitively", async () => {
    // сид: артист A с альбомом "Greatest Hits"; трек этого артиста
    const next = await updateTrackMetadataAndSync(queryClient, track, {
      title: track.title,
      artistNames: ["A"],
      albumTitle: "GREATEST HITS",
    });
    expect(next.albumId).toBe(existingAlbumId);
  });

  it("creates a new album row when no identity match exists", async () => {
    const next = await updateTrackMetadataAndSync(queryClient, track, {
      title: track.title,
      artistNames: ["A"],
      albumTitle: "Brand New Album",
    });
    const created = await db.albums.get(next.albumId);
    expect(created?.title).toBe("Brand New Album");
    expect(created?.artistId).toBe(firstArtistId);
    expect(created?.pinned).toBe(1);
  });

  it("persists trackNo and diskNo", async () => {
    await updateTrackMetadataAndSync(queryClient, track, {
      title: track.title,
      artistNames: ["A"],
      albumId: existingAlbumId,
      trackNo: 7,
      diskNo: 2,
    });
    const row = await db.tracks.get(track.id);
    expect(row?.trackNo).toBe(7);
    expect(row?.diskNo).toBe(2);
  });
});
```

(точные имена сид-хелперов взять из существующих тестов файла; сиды создавать так же, как соседние describe.)

Run: `npx vitest run src/queries/__tests__/track-queries.test.ts` → новые кейсы FAIL.

- [ ] **Step 3: Реализация**

В `track.queries.ts`:

```ts
import { identityKey } from "@/services/entity-resolver";

const resolveAlbumForChanges = async (
  changes: TrackMetadataChanges,
  firstArtistId: ArtistId,
): Promise<AlbumEntity> => {
  if (changes.albumId) return getAlbumByIdOrThrow(changes.albumId);

  const title = changes.albumTitle?.trim().replace(/\s+/g, " ");
  if (!title) throw new Error("Album is required");

  const artistAlbums = await unwrapResult(albumRepository.findByArtistId(firstArtistId));
  const existing = artistAlbums.find(album => identityKey(album.title) === identityKey(title));
  if (existing) return existing;

  const now = Date.now();
  const created: AlbumEntity = {
    id: AlbumId(crypto.randomUUID()),
    title,
    artistId: firstArtistId,
    pinned: 1,
    addedAt: now,
    updatedAt: now,
  };
  await unwrapResult(albumRepository.create(created));
  return created;
};
```

(если у albumRepository нет `findByArtistId`/`create` — использовать фактические методы репозитория; посмотреть `src/db/repositories/album.repository.ts` и подставить реальные: чтение альбомов артиста и вставка строки. Прямые `db.albums.where("artistId")...` допустимы, если методов нет.)

В `updateTrackMetadataAndSync` заменить `const album = await getAlbumByIdOrThrow(changes.albumId);` на `const album = await resolveAlbumForChanges(changes, artists[0].id);` и добавить в оба объекта записи (`trackRepository.update` и `nextTrackEntity`) поля `trackNo: changes.trackNo ?? currentTrack.trackNo` и `diskNo: changes.diskNo ?? currentTrack.diskNo`. В `invalidateForTrackMutation` albumIds уже включает новый `album.id`.

- [ ] **Step 4: Прогнать тесты**

Run: `npx vitest run src/queries/__tests__/track-queries.test.ts; npm run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/entity-resolver.ts src/queries/track.queries.ts src/queries/__tests__/track-queries.test.ts
git commit -m "feat(tracks): update metadata supports creating album by title + track/disk numbers"
```

---

### Task 5: EditTrackPanel v2 + диалог несохранённых изменений

**Files:**
- Rewrite: `src/modules/right-panel/components/panels/EditTrackPanel.vue`
- Create: `src/modules/tracks/components/edit/UnsavedChangesDialog.vue`

**Interfaces:**
- Consumes: `openEntitySelect` (Task 3), новый `TrackMetadataChanges` (Task 4).

- [ ] **Step 1: UnsavedChangesDialog**

```vue
<!-- src/modules/tracks/components/edit/UnsavedChangesDialog.vue -->
<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ $t("track.edit.unsavedTitle") }}</DialogTitle>
        <DialogDescription>{{ $t("track.edit.unsavedDescription") }}</DialogDescription>
      </DialogHeader>
      <DialogFooter class="gap-2">
        <Button
          variant="ghost"
          @click="emit('update:open', false)"
        >
          {{ $t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          @click="emit('discard')"
        >
          {{ $t("track.edit.discard") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [boolean]; "discard": [] }>();
</script>
```

i18n `ru/track.json` → `edit`: `"unsavedTitle": "Несохранённые изменения"`, `"unsavedDescription": "Изменения будут потеряны. Выйти без сохранения?"`, `"discard": "Выйти"`; `en`: `"unsavedTitle": "Unsaved changes"`, `"unsavedDescription": "Your changes will be lost. Leave without saving?"`, `"discard": "Discard"`.

- [ ] **Step 2: Переписать EditTrackPanel**

Требования к новому файлу (полная замена):

- Удалить: закомментированный блок 53–136, `artistSearch`, `TagsInput*`, весь самодельный album-дропдаун, `eslint-disable` в первой строке.
- Схема (valibot; сообщения через `t()` вычисляются в момент валидации — схему собрать в `computed`, а `useForm` получает `toTypedSchema` от неё через `computed`-совместимую опцию `validationSchema: computed(...)`, vee-validate это поддерживает):

```ts
const MAX_TITLE_LENGTH = 120;
const MAX_ARTIST_NAME_LENGTH = 120;

const trackFormSchema = computed(() => object({
  title: pipe(
    string(),
    minLength(1, t("track.edit.validation.titleRequired")),
    maxLength(MAX_TITLE_LENGTH, t("track.edit.validation.titleMaxLength", { max: MAX_TITLE_LENGTH })),
  ),
  artists: pipe(
    array(pipe(string(), maxLength(MAX_ARTIST_NAME_LENGTH, t("track.edit.validation.artistMaxLength", { max: MAX_ARTIST_NAME_LENGTH })))),
    minLength(1, t("track.edit.validation.artistsRequired")),
  ),
  albumLabel: pipe(string(), minLength(1, t("track.edit.validation.albumRequired"))),
  trackNo: optional(pipe(number(), integer(), minValue(1))),
  diskNo: optional(pipe(number(), integer(), minValue(1))),
}));
```

- Состояние альбома: `albumId: Ref<string | null>`, `newAlbumTitle: Ref<string | null>`, `albumLabel` в форме — отображаемое название (существующего или нового).
- Поля формы: `Input` для title; блок «Артисты» — чипы (`Badge` из `@/components/ui/badge`, по одному на имя, без удаления в форме) + `Button variant="ghost-primary"` «Изменить» → `rightPanel.openEntitySelect({ kind: "artists", selectedNames: artists.value, onConfirm: ({ names }) => { if (names) artists.value = names; } })`; блок «Альбом» — строка с текущим `albumLabel` + «Изменить» → `openEntitySelect({ kind: "album", selectedAlbumId: albumId.value ?? undefined, onConfirm: ({ albumId: nextId, albumTitle }) => { ... } })` (колбэк пишет либо nextId + label из выбранного, либо albumTitle в `newAlbumTitle` + label); два числовых `Input type="number"` для trackNo/diskNo.
- `hasChanges`: сравнение title/artists/albumId/newAlbumTitle/trackNo/diskNo с исходным треком.
- Back/close: `handleBack`/обработчик close при `hasChanges` открывают `UnsavedChangesDialog`; `@discard` — реально уйти (запомнить отложенное действие в ref `pendingLeave: (() => void) | null`).
- Сабмит: `updateTrack({ title, artistNames: artists, albumId: newAlbumTitle ? undefined : albumId!, albumTitle: newAlbumTitle ?? undefined, trackNo, diskNo })`; успех — как раньше (`syncTrackMetadata`, toast, `openTrackInfo` depth 1).
- FAB сохранения остаётся (`FloatingActionButton` + `IconSave`).
- Пустое состояние `track.edit.libraryOnly` — `Empty` + `EmptyDescription` (не `<p>`).
- Кодстайл: только стрелочные функции, без комментариев в template.

- [ ] **Step 3: Проверить руками и автоматически**

Run: `npm run type-check; npx eslint --fix src/modules/right-panel/components/panels/EditTrackPanel.vue src/modules/tracks/components/edit/UnsavedChangesDialog.vue; npx vitest run src/modules/right-panel/ src/queries/`
Dev-проверка: изменить название → сохранить; изменить артистов через пикер (выбор + «Создать»); сменить альбом на существующий и на новый; back с изменениями → диалог; без изменений → сразу назад.

- [ ] **Step 4: Commit**

```bash
git add src/modules/right-panel/components/panels/EditTrackPanel.vue src/modules/tracks/components/edit/UnsavedChangesDialog.vue src/app/i18n/locales
git commit -m "feat(edit-track): rebuilt form on entity-select pickers with dirty guard"
```

---

### Task 6: Финальная верификация

- [ ] **Step 1:** `npm run type-check` — чисто.
- [ ] **Step 2:** `npx eslint .` — чисто (кроме игнорируемых тестов).
- [ ] **Step 3:** `npx vitest run` — весь прогон; допустимы только 4 известных падения `useDragReorder.test.ts` (существовали до этой работы).
- [ ] **Step 4:** Ручной сквозной прогон: AddTracksPanel (регрессия), редактирование трека целиком, «Создать альбом», dirty-диалог.
- [ ] **Step 5:** Commit остатков, если были правки по итогам.
