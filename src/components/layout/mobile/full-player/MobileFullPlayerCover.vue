<template>
  <div
    class="flex-1 min-h-0 @container-[size] select-none flex items-center justify-center pb-2 touch-pan-y landscape-short:flex-none landscape-short:basis-[50%] landscape-short:pb-0 landscape-short:overflow-x-clip landscape-short:[mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)]"
    @pointerdown="startDrag"
  >
    <motion.div
      drag="x"
      :drag-listener="false"
      :drag-controls="dragControls"
      :drag-constraints="SWIPE_DRAG_CONSTRAINTS"
      :drag-elastic="horizontalElastic"
      :drag-momentum="false"
      :drag-transition="SWIPE_DRAG_TRANSITION"
      :style="{ x }"
      class="flex size-full items-center justify-center"
      @drag-start="handleDragStart"
      @drag-end="(_event, info) => handleDragEnd(info)"
    >
      <div
        ref="coverRef"
        class="relative aspect-square w-[min(100cqw,100cqh)]"
      >
        <motion.div
          v-for="slot in slots"
          :key="slot.key"
          :aria-hidden="slot.role === 'center' ? undefined : 'true'"
          :class="COVER_SLOT_CLASS[slot.role]"
          :style="{ y: arcs[slot.role].y, rotate: arcs[slot.role].rotate, opacity: slotOpacity[slot.role] }"
        >
          <motion.div
            class="size-full"
            :initial="slot.role === 'center' ? false : { opacity: 0 }"
            :animate="{ opacity: 1 }"
            :transition="{ duration: 0.35 }"
          >
            <NuxtImage
              :src="slot.coverUrl"
              fallback-src="/img/fallback.svg"
              :alt="slot.track.title"
              loading="eager"
              decoding="async"
              class="size-full object-cover"
            />
          </motion.div>
          <CoverStateOverlay :visible="slot.role === 'center' && isScrubbing">
            <span class="text-2xl font-semibold tabular-nums text-white">
              {{ scrubTimeDisplay }}
            </span>
          </CoverStateOverlay>
        </motion.div>
      </div>
    </motion.div>
  </div>
</template>
<script setup lang="ts">
import { useTemplateRef } from "vue";
import { useElementSize } from "@vueuse/core";
import { motion, useTransform } from "motion-v";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import CoverStateOverlay from "@/components/layout/mobile/CoverStateOverlay.vue";
import {
  SWIPE_DRAG_CONSTRAINTS,
  SWIPE_DRAG_TRANSITION,
  useTrackSwipe,
  type SwipeSlotRole,
} from "@/modules/player/composables/useTrackSwipe";
import { useMobilePlayerProgress } from "./progress-context";

const { isScrubbing, scrubTimeDisplay } = useMobilePlayerProgress();

const coverRef = useTemplateRef<HTMLDivElement>("coverRef");
const { width: coverWidth } = useElementSize(coverRef);
const COVER_GAP = 32;
const slotWidth = () => coverWidth.value + COVER_GAP;

const {
  x,
  slots,
  horizontalElastic,
  dragControls,
  startDrag,
  handleDragStart,
  handleDragEnd,
} = useTrackSwipe({ width: slotWidth, offsetThreshold: 70 });

// Slot images decode asynchronously: the only image that is new after a
// swipe is the neighbour sliding in, and it fades in anyway. A synchronous
// decode of full-size album art landed in the frame that switched tracks —
// 15 ms of an 80 ms frame on a phone.
//
// Each slot keeps its own compositor layer: the arc's per-frame y/rotate and
// opacity writes otherwise repaint the full-size art into the strip's tiles
// on every frame of the drag (20–40 ms GPU raster tasks on a phone).
const SLOT_LAYER = "will-change-[transform,opacity]";
const COVER_SLOT_CLASS: Record<SwipeSlotRole, string> = {
  previous: `pointer-events-none absolute top-0 right-[calc(100%+32px)] size-full rounded-2xl bg-muted overflow-hidden shadow-lg ${SLOT_LAYER}`,
  center: `relative z-10 size-full rounded-2xl bg-muted overflow-hidden shadow-lg ${SLOT_LAYER}`,
  next: `pointer-events-none absolute top-0 left-[calc(100%+32px)] size-full rounded-2xl bg-muted overflow-hidden shadow-lg ${SLOT_LAYER}`,
};

const ARC_ANGLE = 12;
const ARC_DIP = 32;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const dipScale = ARC_DIP / (1 - Math.cos(toRadians(ARC_ANGLE)));

const useArc = (slot: -1 | 0 | 1) => {
  const angleAt = (value: number) => (value / Math.max(1, slotWidth()) + slot) * ARC_ANGLE;
  return {
    y: useTransform(x, value => dipScale * (1 - Math.cos(toRadians(angleAt(value))))),
    rotate: useTransform(x, value => angleAt(value)),
  };
};

const arcs: Record<SwipeSlotRole, ReturnType<typeof useArc>> = {
  previous: useArc(-1),
  center: useArc(0),
  next: useArc(1),
};

const travel = (value: number) => Math.min(1, Math.abs(value) / Math.max(1, slotWidth()));
const slotOpacity = {
  center: useTransform(x, value => 1 - 0.4 * travel(value)),
  next: useTransform(x, value => (value < 0 ? 0.6 + 0.4 * travel(value) : 0.6)),
  previous: useTransform(x, value => (value > 0 ? 0.6 + 0.4 * travel(value) : 0.6)),
} satisfies Record<SwipeSlotRole, unknown>;
</script>
