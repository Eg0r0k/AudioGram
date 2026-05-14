<script setup lang="ts">
import { computed } from "vue";
import Digit from "./Digit.vue";

interface Props {
  value: number;
  padStart?: boolean;
  decimalSeparator?: string;
}

const props = withDefaults(defineProps<Props>(), {
  padStart: false,
  decimalSeparator: ".",
});

const parsedValue = computed(() => {
  const absValue = Math.abs(props.value);
  const [integerPart, decimalPart] = absValue.toString().split(".");
  const integerValue = parseInt(integerPart, 10);
  const paddedInteger = props.padStart && integerValue < 10 ? `0${integerPart}` : integerPart;
  const integerDigits = paddedInteger.split("");
  const integerPlaces = integerDigits.map((_, i) => Math.pow(10, integerDigits.length - i - 1));

  return {
    integerDigits,
    integerPlaces,
    integerValue,
    decimalPart,
    decimalValue: decimalPart ? parseInt(decimalPart, 10) : 0,
  };
});
</script>

<template>
  <div class="flex items-center">
    <span v-if="value < 0">-</span>
    <Digit
      v-for="(_, index) in parsedValue.integerDigits"
      :key="`pos-${parsedValue.integerPlaces[index]}`"
      :value="parsedValue.integerValue"
      :place="parsedValue.integerPlaces[index]"
    />
    <template v-if="parsedValue.decimalPart">
      <span>{{ decimalSeparator }}</span>
      <Digit
        v-for="(_, index) in parsedValue.decimalPart.split('')"
        :key="`decimal-${index}`"
        :value="parsedValue.decimalValue"
        :place="Math.pow(10, parsedValue.decimalPart.length - index - 1)"
      />
    </template>
  </div>
</template>
