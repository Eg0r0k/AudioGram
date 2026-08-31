<template>
  <div class="flex h-full flex-col items-center justify-center gap-1 text-center">
    <div class="flex flex-col items-center pb-4">
      <h2 class="mb-2 text-2xl font-bold">
        {{ t("errors.title") }}
      </h2>
      <p class="text-lg font-medium text-muted-foreground">
        {{ message }}
      </p>
    </div>

    <div class="flex gap-2">
      <Button
        size="xl"
        @click="$emit('retry')"
      >
        {{ t("common.retry") }}
      </Button>
      <Button
        size="xl"
        variant="ghost-primary"
        @click="goHome"
      >
        {{ t("nav.home") }}
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { routeLocation } from "@/app/router/route-locations";
import { useRouter } from "vue-router";
import { getLogger } from "@/lib/logger";

defineProps<{
  message: string;
}>();

defineEmits<{
  retry: [];
}>();

const { t } = useI18n();
const router = useRouter();
const goHome = () => {
  router.push(routeLocation.home())
    .catch(error => getLogger().error(`[PageErrorState] Navigation home failed: ${String(error)}`));
};

</script>
