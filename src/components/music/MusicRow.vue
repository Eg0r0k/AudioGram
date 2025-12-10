<template>
  <div
    v-ripple="{ opacity: 0.1, duration: 1000 }"
    tabindex="0"
    class="gird relative select-none cursor-pointer p-2 rounded-[10px] hover:bg-muted/20"
  >
    <div class="flex items-center">
      <img
        :alt="$t('player.cover')"
        class="size-13 rounded-lg z-1 object-cover mr-3"
        loading="eager"
        width="40"
        height="40"
        src="https://i.scdn.co/image/ab67616d000048514feb42ff53928276cf9d9f5a"
      >
      <div>
        <div>
          <span class="font-medium truncate">Title</span>
        </div>
        <!-- <div>Badge</div> -->
        <div>
          <span
            class="inline-flex text-sm truncate items-center justify-center text-muted-foreground"
          >Artist</span>
        </div>
      </div>
    </div>
  </div>
</template>
