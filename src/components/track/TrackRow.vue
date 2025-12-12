<script setup lang="ts">

</script>

<template>
  <div
    v-ripple
    tabindex="0"
    class="gird relative select-none cursor-pointer p-2 rounded-[10px] hover:bg-muted/20 data-[state=open]:bg-muted/20"
  >
    <div class="flex items-center">
      <img
        :alt="$t('player.cover')"
        class=" size-12 rounded-sm z-1 object-cover mr-3"
        loading="eager"
        width="40"
        height="40"
        src="https://i.scdn.co/image/ab67616d000048514feb42ff53928276cf9d9f5a"
      >
      <div class=" pr-2 flex leading-tight flex-col">
        <div>
          <span class="font-medium truncate">Title</span>
        </div>
        <!-- <div>Badge</div> -->
        <div>
          <span
            class="inline-flex   text-sm truncate items-center justify-center text-muted-foreground"
          >Artist</span>
        </div>
      </div>
    </div>
  </div>
</template>
