<script lang="ts" setup>
import { computed, shallowRef } from "vue";
import { useForwardPropsEmits } from "reka-ui";
import {
  ColorPickerRoot,
  ColorPickerCanvas,
  ColorPickerEyeDropper,
  ColorPickerSliderHue,
  ColorPickerSliderAlpha,
  ColorPickerInputHex,
  ColorPickerInputHSL,
  ColorPickerInputRGB,
  ColorPickerInputHSB,
  type ColorPickerRootProps,
  type ColorPickerRootEmits,
} from "@vuelor/picker";
import IconColorPicker from "~icons/tabler/color-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const INPUTS = {
  Hex: ColorPickerInputHex,
  RGB: ColorPickerInputRGB,
  HSL: ColorPickerInputHSL,
  HSB: ColorPickerInputHSB,
};

type Format = keyof typeof INPUTS;

type ColorPickerProps = Omit<ColorPickerRootProps, "styling" | "ui">;

const props = defineProps<ColorPickerProps>();
const emits = defineEmits<ColorPickerRootEmits>();

const forwarded = useForwardPropsEmits(props, emits);

const inputFormat = shallowRef<Format>("Hex");
const formatOptions = Object.keys(INPUTS) as Format[];
const canvasType = computed<"HSL" | "HSV">(() => {
  return inputFormat.value === "HSL" ? "HSL" : "HSV";
});

function onFormatChange(value: unknown) {
  if (typeof value === "string" && value in INPUTS) inputFormat.value = value as Format;
}

const ui = {
  picker: {
    root: "bg-transparent text-foreground shadow-none rounded-none p-0 gap-3",
  },
  canvas: { root: "rounded-md" },
  dropper: {
    root: "rounded-md enabled:hover:bg-accent enabled:hover:text-accent-foreground",
  },
  input: {
    group: "rounded-md",
    item: "first:rounded-l-md last:rounded-r-md",
    label: "hidden",
    field: "h-8 text-xs",
  },
};
</script>

<template>
  <ColorPickerRoot
    :ui="ui"
    v-bind="forwarded"
  >
    <ColorPickerCanvas :type="canvasType" />
    <div class="flex items-center gap-2">
      <ColorPickerEyeDropper
        type="button"
        aria-label="Pick color from screen"
      >
        <IconColorPicker class="size-5" />
      </ColorPickerEyeDropper>
      <div class="flex flex-1 flex-col gap-2">
        <ColorPickerSliderHue />
        <ColorPickerSliderAlpha />
      </div>
    </div>
    <div class="flex items-center gap-2">
      <!-- eslint-disable-next-line vuejs-accessibility/form-control-has-label -- renderless reka root, the trigger below carries the label -->
      <Select
        :model-value="inputFormat"
        :disabled="props.disabled"
        @update:model-value="onFormatChange"
      >
        <SelectTrigger
          size="sm"
          class="px-2"
          aria-label="Color format"
        >
          <SelectValue placeholder="Format" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in formatOptions"
            :key="option"
            :value="option"
          >
            {{ option }}
          </SelectItem>
        </SelectContent>
      </Select>
      <component :is="INPUTS[inputFormat]" />
    </div>
  </ColorPickerRoot>
</template>
