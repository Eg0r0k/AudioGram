<template>
  <div class="settings-group">
    <h2
      v-if="title"
      class="settings-group-title"
    >
      {{ title }}
    </h2>
    <div class="settings-group-content">
      <slot />
    </div>
    <p
      v-if="description"
      class="settings-group-description"
    >
      {{ description }}
    </p>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title?: string;
  description?: string;
}

defineProps<Props>();
</script>

<style scoped>
.settings-group {
  margin-bottom: 1.5rem;
}

.settings-group:last-child {
  margin-bottom: 0;
}

.settings-group-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--muted-foreground);
  text-transform: uppercase;
  letter-spacing: 0.025em;
  margin: 0 0 0.625rem;
  padding-left: 0.25rem;
}

.settings-group-content {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.settings-group-description {
  font-size: 0.8125rem;
  color: var(--muted-foreground);
  margin: 0.5rem 0 0;
  padding: 0 0.25rem;
  line-height: 1.5;
}
</style>
