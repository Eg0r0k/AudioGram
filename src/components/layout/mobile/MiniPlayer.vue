<template>
  <div
    ref="wrapperRef"
    class="relative w-full h-14 shrink-0 overflow-x-clip touch-none"
    @pointerdown="startDrag"
  >
    <motion.div
      drag
      drag-direction-lock
      :drag-listener="false"
      :drag-controls="dragControls"
      :drag-constraints="SWIPE_DRAG_CONSTRAINTS"
      :drag-elastic="dragElastic"
      :drag-momentum="false"
      :drag-transition="SWIPE_DRAG_TRANSITION"
      :style="{ x, y }"
      class="relative size-full"
      @drag-start="handleDragStart"
      @direction-lock="handleDirectionLock"
      @drag-end="handleDragEnd"
    >
      <motion.button
        v-for="slot in slots"
        :key="slot.key"
        v-ripple
        :class="SLOT_CLASS[slot.role]"
        :style="{ opacity: slotOpacity[slot.role] }"
        :aria-hidden="slot.role === 'center' ? undefined : 'true'"
        :tabindex="slot.role === 'center' ? undefined : -1"
        :aria-label="slot.role === 'center' ? $t('player.nowPlaying') : undefined"
        @click.capture="guardClick"
        @click="handleOpenFullPlayer"
      >
        <MiniPlayerCard
          :title="slot.track.title"
          :artist="slot.track.artist ?? ''"
          :cover-url="slot.coverUrl"
          :background="cardBackground"
          :gradient-color="gradientColor"
          :show-progress="slot.role === 'center'"
        >
          <template
            v-if="slot.role === 'center'"
            #actions
          >
            <PlayButton
              class="bg-transparent text-white hover:bg-white/10"
              :icon-size="24"
              @click.stop
            />
            <Button
              variant="ghost"
              size="icon-lg"
              class="rounded-full text-white"
              :aria-label="$t('player.queue')"
              @click.stop="rightPanel.openQueue()"
            >
              <IconPlaylist class="size-5" />
            </Button>
          </template>
        </MiniPlayerCard>
      </motion.button>
    </motion.div>
  </div>
</template>

<script setup lang="ts">
import { computed, provide, ref, useTemplateRef } from "vue";
import { miniPlayerProgressKey } from "./mini-player-context";
import { useElementSize } from "@vueuse/core";
import { motion, useMotionValue, useTransform, type PanInfo } from "motion-v";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { useMobilePlayerColor } from "@/modules/player/composables/useMobilePlayerColor";
import { usePlayerProgress } from "@/modules/tracks/composables/usePlayerProgress";
import {
  SWIPE_DRAG_CONSTRAINTS,
  SWIPE_DRAG_TRANSITION,
  useTrackSwipe,
  type SwipeSlotRole,
} from "@/modules/player/composables/useTrackSwipe";
import { Button } from "@/components/ui/button";
import MiniPlayerCard from "@/components/layout/mobile/MiniPlayerCard.vue";
import IconPlaylist from "~icons/tabler/playlist";
import PlayButton from "@/modules/player/components/PlayButton.vue";

const rightPanel = useRightPanelStore();
const wrapperRef = useTemplateRef<HTMLDivElement>("wrapperRef");
const { width: wrapperWidth } = useElementSize(wrapperRef);

const emit = defineEmits<{
  click: [];
}>();

const { color: playerColor } = useMobilePlayerColor();

const cardBackground = computed(() => `color-mix(in oklch, ${playerColor.value.hsl} 25%, black)`);
const gradientColor = computed(() => playerColor.value.hsl);

const { displayProgress } = usePlayerProgress();
provide(miniPlayerProgressKey, displayProgress);

// Pointer travel (px) / release velocity (px/s) of an upward pull that opens
// the full player; either the distance or a fast flick is enough.
const OPEN_OFFSET = 40;
const OPEN_VELOCITY = 400;
// Neighbour cards sit one wrapper width plus this gap away.
const CARD_GAP = 8;

// The centre card is the only in-flow element and fills the strip; the
// neighbours hang off its sides. A slot keeps its DOM node across role
// changes (keyed by queue item), so only these classes change on a swap.
const SLOT_CLASS: Record<SwipeSlotRole, string> = {
  previous: "pointer-events-none absolute inset-y-0 right-[calc(100%+8px)] w-full rounded-lg text-left",
  center: "relative block size-full cursor-pointer rounded-lg text-left [-webkit-tap-highlight-color:transparent]",
  next: "pointer-events-none absolute inset-y-0 left-[calc(100%+8px)] w-full rounded-lg text-left",
};

const {
  x,
  isDragging,
  slots,
  horizontalElastic,
  dragControls,
  startDrag,
  handleDragStart,
  handleDragEnd: finishTrackDrag,
} = useTrackSwipe({ width: () => wrapperWidth.value + CARD_GAP });

// Up is a short, stiff tug (the full player opens on release anyway); down is
// locked because the bottom nav sits right under the card.
const dragElastic = computed(() => ({
  ...horizontalElastic.value,
  top: 0.1,
  bottom: 0,
}));

const y = useMotionValue(0);

// Cards dim as they leave the centre and brighten as they arrive, so the
// rebase after a track change is continuous.
const travel = (value: number) =>
  Math.min(1, Math.abs(value) / Math.max(1, wrapperWidth.value + CARD_GAP));
const slotOpacity = {
  center: useTransform(x, value => 1 - 0.45 * travel(value)),
  next: useTransform(x, value => (value < 0 ? 0.55 + 0.45 * travel(value) : 0.55)),
  previous: useTransform(x, value => (value > 0 ? 0.55 + 0.45 * travel(value) : 0.55)),
} satisfies Record<SwipeSlotRole, unknown>;

const lockedAxis = ref<"x" | "y" | null>(null);
const suppressClickUntil = ref(0);

// Runs in the capture phase so the click produced by a finished drag never
// reaches the inner play/queue buttons either. `isDragging` covers the click
// that lands before motion delivers the (post-render) drag-end callback.
const guardClick = (event: MouseEvent) => {
  if (!isDragging.value && Date.now() >= suppressClickUntil.value) return;
  event.stopPropagation();
  event.preventDefault();
};

const handleOpenFullPlayer = () => {
  if (Date.now() < suppressClickUntil.value) return;
  emit("click");
};

// Fires synchronously on the first pointer move, before the post-render
// drag-start callback, so the axis is only reset once the drag has ended.
const handleDirectionLock = (axis: "x" | "y") => {
  lockedAxis.value = axis;
};

const handleDragEnd = (_event: PointerEvent, info: PanInfo) => {
  suppressClickUntil.value = Date.now() + 250;

  const { offset, velocity } = info;
  const axis
    = lockedAxis.value ?? (Math.abs(offset.x) >= Math.abs(offset.y) ? "x" : "y");
  lockedAxis.value = null;

  finishTrackDrag(info, axis === "x");
  if (axis === "y" && (offset.y <= -OPEN_OFFSET || velocity.y <= -OPEN_VELOCITY)) emit("click");
};
</script>
