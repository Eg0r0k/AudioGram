<template>
  <div class="pip-container">
    <Button> ТЕСТ </Button>
  </div>
</template>
<script setup lang="ts">
import { Button } from "@/components/ui/button";
</script>
<style lang="css" scoped>
.pip-container {
  display: grid;
  user-select: none;
  grid-template-rows: 1fr auto;
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
