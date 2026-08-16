<template>
  <Tabs
    :model-value="model"
    @update:model-value="model = $event as StatsPeriod"
  >
    <TabsList class="flex w-full">
      <TabsTrigger
        v-for="p in PERIODS"
        :key="p"
        :value="p"
        class="flex-1"
      >
        {{ $t(`settings.stats.period${capitalize(p)}`) }}
      </TabsTrigger>
    </TabsList>
  </Tabs>
</template>

<script setup lang="ts">
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StatsPeriod } from "./period";

const model = defineModel<StatsPeriod>({ required: true });

const PERIODS: StatsPeriod[] = ["week", "month", "year", "all"];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>
