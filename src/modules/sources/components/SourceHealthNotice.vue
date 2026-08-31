<template>
  <div
    v-if="failure"
    class="rounded-xl bg-destructive/10 px-3 py-2.5 flex items-start gap-2.5"
  >
    <IconAlertTriangle class="size-5 shrink-0 text-destructive mt-0.5" />

    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium text-destructive">
        {{ title }}
      </p>
      <p class="text-xs text-muted-foreground wrap-break-word">
        {{ failure.message }}
      </p>

      <div class="flex items-center gap-1 pt-1.5 -ml-2">
        <Button
          size="sm"
          variant="ghost"
          :disabled="isChecking"
          @click="retry"
        >
          <IconLoader2
            v-if="isChecking"
            class="size-4 animate-spin"
          />
          {{ $t("source.health.retry") }}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          @click="openSettings"
        >
          {{ $t("source.health.settings") }}
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import IconAlertTriangle from "~icons/tabler/alert-triangle";
import IconLoader2 from "~icons/tabler/loader-2";
import { ROUTE_NAMES } from "@/app/router/route-names";
import { getLogger } from "@/lib/logger";
import type { SourceKind } from "@/types/track-ref";
import type { SourceError } from "../types";
import { useSourceHealth, checkSource } from "../composables/useSourceHealth";

//
// A source that cannot answer says so once, here, instead of leaving every
// list on the page empty with no explanation. Only source-level failures
// reach this — a rejected credential or an unreachable server; see lib/health.
//

const props = defineProps<{ kind: SourceKind | null }>();

const { t } = useI18n();
const router = useRouter();

const health = useSourceHealth(() => props.kind);

// Held across a re-check so the notice does not blink out of existence while
// the probe it offered is running — it clears only once something answers.
const failure = ref<SourceError | null>(null);

watchEffect(() => {
  const current = health.value;
  if (current.state === "failed") failure.value = current.error;
  else if (current.state !== "checking") failure.value = null;
});

const isChecking = computed(() => health.value.state === "checking");

const title = computed(() => {
  const source = props.kind ? t(`source.${props.kind}`) : "";
  return failure.value?.kind === "AUTH"
    ? t("source.health.authFailed", { source })
    : t("source.health.unreachable", { source });
});

const retry = () => {
  // The probe records its own verdict in the health store; only a probe that
  // threw outright leaves nothing behind, so that is what gets logged.
  if (props.kind) {
    checkSource(props.kind)
      .catch(error => getLogger().error(`[Sources] Re-probing ${String(props.kind)} failed: ${String(error)}`));
  }
};

const openSettings = () => {
  router.push({ name: ROUTE_NAMES.SETTINGS_SOURCES })
    .catch(error => getLogger().error(`[Sources] Navigation to the sources settings failed: ${String(error)}`));
};
</script>
