<template>
  <div>
    <Item
      v-ripple
      size="sm"
    >
      <ItemMedia>
        <BadgeCheckIcon class="size-5" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Your profile has been verified.</ItemTitle>
      </ItemContent>
      <ItemActions>
        <ChevronRightIcon class="size-4" />
      </ItemActions>
    </Item>
  </div>
</template>
<script lang="ts" setup>

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { BadgeCheckIcon, ChevronRightIcon } from "lucide-vue-next";

</script>
