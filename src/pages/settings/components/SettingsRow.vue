<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="settings-row"
    :class="{
      'is-clickable': clickable,
      'is-destructive': destructive
    }"
    @click="clickable ? $emit('click') : null"
  >
    <div class="settings-row-main">
      <div class="settings-row-text">
        <span class="settings-row-label">{{ label }}</span>
        <span
          v-if="description"
          class="settings-row-description"
        >
          {{ description }}
        </span>
      </div>
    </div>

    <div class="settings-row-action">
      <slot />
      <template v-if="!$slots.default">
        <span
          v-if="value"
          class="settings-row-value"
        >{{ value }}</span>
        <ChevronRight
          v-if="clickable"
          class="size-5 text-[var(--muted-foreground)]"
        />
      </template>
    </div>
  </component>
</template>

<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";

interface Props {
  label: string;
  description?: string;
  value?: string;
  clickable?: boolean;
  destructive?: boolean;
}

defineProps<Props>();
defineEmits<{
  click: [];
}>();
</script>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  padding: 0.875rem 1rem;
  background: transparent;
  border: none;
  text-align: left;
  cursor: default;
  transition: background 0.15s ease;
}

.settings-row:not(:last-child) {
  border-bottom: 1px solid var(--border);
}

.settings-row.is-clickable {
  cursor: pointer;
}

.settings-row.is-clickable:hover {
  background: var(--accent);
}

.settings-row.is-clickable:active {
  background: var(--muted);
}

.settings-row-main {
  flex: 1;
  min-width: 0;
}

.settings-row-text {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.settings-row-label {
  font-size: 0.9375rem;
  font-weight: 450;
  color: var(--foreground);
}

.settings-row.is-destructive .settings-row-label {
  color: var(--destructive);
}

.settings-row-description {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  line-height: 1.4;
}

.settings-row-action {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.settings-row-value {
  font-size: 0.9375rem;
  color: var(--muted-foreground);
}
</style>
