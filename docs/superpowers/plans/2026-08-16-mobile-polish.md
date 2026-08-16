# Mobile Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Стеклянные тосты Sonner, парящий мини-плеер с централизованным резервом места, диалог подтверждения «Удалить все данные» с задержкой кнопки.

**Architecture:** Три независимых изменения: CSS-правка обёртки vue-sonner; перевод MiniPlayer в absolute-overlay в MobileLayout с CSS-переменной `--mini-player-h` для резерва; новый локальный диалог на базе `@/components/ui/dialog` с 3-секундным отсчётом, встроенный в StorageSettings.

**Tech Stack:** Vue 3 `<script setup>` + TS, Tailwind v4, reka-ui (ui/dialog), vue-i18n (en+ru), Vitest + Testing Library (`renderWithPlugins` из `@/test/utils`), pnpm.

## Global Constraints

- Пакетный менеджер: `pnpm`; команды запускать из корня `C:\Users\Егор\Desktop\Audiogram`.
- Никаких новых зависимостей.
- Все пользовательские строки — через vue-i18n, ключи добавлять в ОБЕ локали (`en`, `ru`).
- Tailwind v4: произвольные переменные в классах пишутся как `pb-(--mini-player-h)` (синтаксис проекта, см. `top-(--toolbar-height)` в MobileLayout).
- `color-mix()` НЕ помещать в инлайн `:style` (теряется в happy-dom) — только в `<style>`-блоки.
- Спека: `docs/superpowers/specs/2026-08-16-mobile-polish-design.md`.

---

### Task 1: Стеклянные тосты Sonner

**Files:**
- Modify: `src/components/ui/sonner/Sonner.vue` (строки 20 и 46-64)

**Interfaces:**
- Consumes: CSS-переменные темы `--popover`, `--border` из `src/style.css`.
- Produces: ничего для других задач (изолированная правка).

- [ ] **Step 1: Убрать `--normal-bg` из инлайн-стиля**

В `Sonner.vue` строка 20, заменить

```vue
    :style="{ '--normal-bg': 'var(--popover)', '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)', '--border-radius': 'var(--radius)', }"
```

на

```vue
    :style="{ '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)', '--border-radius': 'var(--radius)', }"
```

- [ ] **Step 2: Переписать `<style>`-блок под стекло**

Заменить текущее правило `[data-sonner-toast]` (строки 47-50) на:

```css
.toaster {
  --normal-bg: color-mix(in oklch, var(--popover) 70%, transparent);
}

[data-sonner-toast] {
  gap: 16px !important;
  border: 1px solid color-mix(in oklch, var(--border) 60%, transparent) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.28) !important;
}
```

Правила `[data-button]` ниже не трогать.

- [ ] **Step 3: Проверка**

Run: `pnpm type-check; pnpm lint`
Expected: без ошибок (CSS-правка юнит-тестами не покрывается; визуальная проверка — на финальном прогоне приложения).

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/sonner/Sonner.vue
git commit -m "feat(ui): glass background with blur for sonner toasts"
```

---

### Task 2: Парящий мини-плеер + резерв нижнего пространства

**Files:**
- Modify: `src/layouts/MobileLayout.vue` (строки 2-6, 10-20)
- Modify: `src/components/layout/mobile/MiniPlayer.vue` (строка 9)

**Interfaces:**
- Consumes: `playerStore.currentTrack`, `bottom` из `useScreenSafeArea()` — уже есть в MobileLayout.
- Produces: CSS-переменная `--mini-player-h` на корне мобильного лейаута (64px при активном треке, 0px без). Страницы её не читают напрямую — резерв применяется к `<main>`.

- [ ] **Step 1: Корень лейаута — `relative` + `--mini-player-h`**

В `MobileLayout.vue` заменить открывающий div (строки 2-6):

```vue
  <div
    ref="dropZoneRef"
    class="relative flex bg-muted dark:bg-card flex-col h-dvh overflow-hidden antialiased"
    :style="{ paddingTop: top, paddingRight: right, paddingBottom: bottom, paddingLeft: left, '--mini-player-h': playerStore.currentTrack ? '64px' : '0px' }"
  >
```

- [ ] **Step 2: Резерв места в `<main>`**

Заменить класс `<main>` (строки 10-12):

```vue
    <main
      class="flex-1 overflow-y-auto overflow-x-hidden min-h-0 pb-(--mini-player-h)"
    >
```

- [ ] **Step 3: MiniPlayer в absolute-обёртку**

Заменить блок (строки 16-20):

```vue
    <MiniPlayer
      v-if="playerStore.currentTrack"
      class="my-1"
      @click="isFullPlayerOpen = true"
    />
```

на

```vue
    <div
      v-if="playerStore.currentTrack"
      class="pointer-events-none absolute inset-x-0 bottom-0 z-30"
      :style="{ paddingBottom: bottom }"
    >
      <MiniPlayer
        class="pointer-events-auto my-1"
        @click="isFullPlayerOpen = true"
      />
    </div>
```

(z-30 — ниже фулл-плеера `z-40` и правой панели `z-50`.)

- [ ] **Step 4: Тень карточке плеера**

В `MiniPlayer.vue` строка 9 добавить классы тени:

```vue
    <div
      class="relative flex-1 rounded-lg overflow-hidden transition-colors duration-300 shadow-lg shadow-black/40"
      :style="containerStyle"
    >
```

- [ ] **Step 5: Проверка**

Run: `pnpm type-check; pnpm lint; pnpm test:run`
Expected: без ошибок, существующие тесты зелёные (правка чисто шаблонная).

- [ ] **Step 6: Commit**

```bash
git add src/layouts/MobileLayout.vue src/components/layout/mobile/MiniPlayer.vue
git commit -m "feat(mobile): floating mini player, reserve bottom space via --mini-player-h"
```

---

### Task 3: Диалог подтверждения «Удалить все данные»

**Files:**
- Create: `src/app/i18n/locales/en/dialogs/clearAllData.json`
- Create: `src/app/i18n/locales/ru/dialogs/clearAllData.json`
- Modify: `src/app/i18n/locales/en/dialogs/index.ts`, `src/app/i18n/locales/ru/dialogs/index.ts`
- Modify: `src/app/i18n/locales/en/settings.json`, `src/app/i18n/locales/ru/settings.json` (ключ `storage.clearAllDone`)
- Create: `src/pages/settings/components/ClearAllDataDialog.vue`
- Create: `src/pages/settings/components/__tests__/ClearAllDataDialog.spec.ts`
- Modify: `src/pages/settings/StorageSettings.vue`

**Interfaces:**
- Consumes: `Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle` из `@/components/ui/dialog`; `Button` из `@/components/ui/button`; `clearAllData()`, `isClearing`, `formatted` из `useStorageSettings()`.
- Produces: компонент `ClearAllDataDialog` — props `{ open: boolean; stats: { tracksCount: number; albumsCount: number; artistsCount: number; totalUsed: string }; pending?: boolean }`, emits `update:open (boolean)`, `confirm ()`.

- [ ] **Step 1: Локали**

`src/app/i18n/locales/en/dialogs/clearAllData.json`:

```json
{
  "title": "Delete all data?",
  "description": "This cannot be undone. Your library, covers, lyrics and offline copies will be deleted.",
  "summary": "{tracks} tracks · {albums} albums · {artists} artists · {size}",
  "confirm": "Delete",
  "confirmCountdown": "Delete ({seconds})"
}
```

`src/app/i18n/locales/ru/dialogs/clearAllData.json`:

```json
{
  "title": "Удалить все данные?",
  "description": "Это действие необратимо. Будут удалены библиотека, обложки, тексты и офлайн-копии.",
  "summary": "{tracks} треков · {albums} альбомов · {artists} исполнителей · {size}",
  "confirm": "Удалить",
  "confirmCountdown": "Удалить ({seconds})"
}
```

В ОБОИХ `dialogs/index.ts` добавить импорт и ключ (по образцу существующих):

```ts
import clearAllData from "./clearAllData.json";
// ...в export default:
  clearAllData,
```

В `en/settings.json` внутри объекта `storage` добавить `"clearAllDone": "All data deleted"`, в `ru/settings.json` — `"clearAllDone": "Все данные удалены"` (рядом с существующим ключом `clearAll`).

- [ ] **Step 2: Написать падающий тест**

`src/pages/settings/components/__tests__/ClearAllDataDialog.spec.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { renderWithPlugins, screen } from "@/test/utils";
import ClearAllDataDialog from "@/pages/settings/components/ClearAllDataDialog.vue";

const stats = { tracksCount: 10, albumsCount: 2, artistsCount: 3, totalUsed: "1.2 GB" };

function deleteButton() {
  return screen.getByRole("button", { name: /delete/i }) as HTMLButtonElement;
}

describe("ClearAllDataDialog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables the delete button while the countdown runs", () => {
    renderWithPlugins(ClearAllDataDialog, {
      props: { open: true, stats },
    });

    expect(deleteButton().disabled).toBe(true);
    expect(deleteButton().textContent).toContain("(3)");
  });

  it("enables the delete button after 3 seconds", async () => {
    renderWithPlugins(ClearAllDataDialog, {
      props: { open: true, stats },
    });

    vi.advanceTimersByTime(3000);
    await nextTick();

    expect(deleteButton().disabled).toBe(false);
    expect(deleteButton().textContent).not.toContain("(");
  });

  it("emits confirm on click after the countdown", async () => {
    const { emitted } = renderWithPlugins(ClearAllDataDialog, {
      props: { open: true, stats },
    });

    vi.advanceTimersByTime(3000);
    await nextTick();
    deleteButton().click();
    await nextTick();

    expect(emitted("confirm")).toBeTruthy();
  });

  it("restarts the countdown when reopened", async () => {
    const { rerender } = renderWithPlugins(ClearAllDataDialog, {
      props: { open: true, stats },
    });

    vi.advanceTimersByTime(3000);
    await nextTick();
    await rerender({ open: false, stats });
    await rerender({ open: true, stats });

    expect(deleteButton().disabled).toBe(true);
    expect(deleteButton().textContent).toContain("(3)");
  });

  it("shows the summary of what will be deleted", () => {
    renderWithPlugins(ClearAllDataDialog, {
      props: { open: true, stats },
    });

    expect(screen.getByText(/10 tracks/)).toBeTruthy();
    expect(screen.getByText(/1\.2 GB/)).toBeTruthy();
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `pnpm vitest run src/pages/settings/components/__tests__/ClearAllDataDialog.spec.ts`
Expected: FAIL — «Failed to resolve import … ClearAllDataDialog.vue» (файла ещё нет).

- [ ] **Step 4: Реализовать компонент**

`src/pages/settings/components/ClearAllDataDialog.vue`:

```vue
<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ $t("dialogs.clearAllData.title") }}</DialogTitle>
        <DialogDescription>
          {{ $t("dialogs.clearAllData.description") }}
        </DialogDescription>
      </DialogHeader>

      <p class="text-sm text-muted-foreground">
        {{ $t("dialogs.clearAllData.summary", {
          tracks: stats.tracksCount,
          albums: stats.albumsCount,
          artists: stats.artistsCount,
          size: stats.totalUsed,
        }) }}
      </p>

      <DialogFooter>
        <Button
          variant="ghost-primary"
          @click="emit('update:open', false)"
        >
          {{ $t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          :disabled="countdown > 0 || pending"
          @click="emit('confirm')"
        >
          {{ countdown > 0
            ? $t("dialogs.clearAllData.confirmCountdown", { seconds: countdown })
            : $t("dialogs.clearAllData.confirm") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  open: boolean;
  stats: {
    tracksCount: number;
    albumsCount: number;
    artistsCount: number;
    totalUsed: string;
  };
  pending?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  "confirm": [];
}>();

const COUNTDOWN_SECONDS = 3;
const countdown = ref(COUNTDOWN_SECONDS);
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

watch(() => props.open, (open) => {
  stopTimer();
  if (!open) return;
  countdown.value = COUNTDOWN_SECONDS;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) stopTimer();
  }, 1000);
}, { immediate: true });

onBeforeUnmount(stopTimer);
</script>
```

- [ ] **Step 5: Прогнать тест компонента**

Run: `pnpm vitest run src/pages/settings/components/__tests__/ClearAllDataDialog.spec.ts`
Expected: PASS (5 тестов).

- [ ] **Step 6: Интегрировать в StorageSettings**

В `src/pages/settings/StorageSettings.vue`:

а) в `<script setup>` добавить импорты и состояние:

```ts
import { onMounted, ref } from "vue";
import ClearAllDataDialog from "@/pages/settings/components/ClearAllDataDialog.vue";
```

(заменив существующий `import { onMounted } from "vue";`)

```ts
const isClearAllOpen = ref(false);

async function handleClearAllConfirm() {
  await clearAllData();
  isClearAllOpen.value = false;
  toast.success(t("settings.storage.clearAllDone"));
}
```

б) кнопку «Очистить всё» (строки 214-222) перевести на открытие диалога:

```vue
        <Button
          class="w-full h-14 justify-start"
          variant="ghost-primary"
          size="xl"
          :disabled="isClearing"
          @click="isClearAllOpen = true"
        >
          <TrashIcon class="size-6" />
          {{ $t('settings.storage.clearAll') }}
        </Button>
```

в) перед закрывающим `</Scrollable>` (после `WatchedFoldersSection`) добавить:

```vue
      <ClearAllDataDialog
        v-model:open="isClearAllOpen"
        :stats="{
          tracksCount: formatted.tracksCount,
          albumsCount: formatted.albumsCount,
          artistsCount: formatted.artistsCount,
          totalUsed: formatted.totalUsed,
        }"
        :pending="isClearing"
        @confirm="handleClearAllConfirm"
      />
```

- [ ] **Step 7: Полная проверка**

Run: `pnpm type-check; pnpm lint; pnpm test:run`
Expected: без ошибок, все тесты зелёные.

- [ ] **Step 8: Commit**

```bash
git add src/app/i18n/locales/en/dialogs/clearAllData.json src/app/i18n/locales/ru/dialogs/clearAllData.json src/app/i18n/locales/en/dialogs/index.ts src/app/i18n/locales/ru/dialogs/index.ts src/app/i18n/locales/en/settings.json src/app/i18n/locales/ru/settings.json src/pages/settings/components/ClearAllDataDialog.vue "src/pages/settings/components/__tests__/ClearAllDataDialog.spec.ts" src/pages/settings/StorageSettings.vue
git commit -m "feat(settings): confirm clear-all data with delayed destructive button"
```
