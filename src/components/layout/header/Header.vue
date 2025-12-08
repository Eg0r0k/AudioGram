<template>
  <header
    class="flex justify-between items-center p-2 bg-card"
  >
    <Button
      class="rounded-full"
      variant="ghost"
      size="icon-lg"
      @click="toggleLeftSidebar"
    >
      <Icon
        class="size-6"
        icon="tabler:menu-2"
      />
    </Button>
    <!-- <div class="flex gap-2">
      <Button @click="handleThemeToggle" size="icon-sm" class="rounded-full">
        <component :is="themeIcon" class="h-4 w-4" />
      </Button>
      <Button size="icon-sm" asChild class="rounded-full">
        <Link to="/">
          <Home />
        </Link>
      </Button>
    </div>

    <Motion
      :animate="{
        width: isSearchFocused ? 320 : 200,
      }"
      :transition="{
        type: 'spring',
        stiffness: 400,
        damping: 30,
      }"
      class="relative"
    >
      <InputGroup class="rounded-full bg-background!">
        <InputGroupInput
          :placeholder="$t('common.search')"
          @focus="isSearchFocused = true"
          @blur="isSearchFocused = false"
        />
        <InputGroupAddon>
          <Search class="w-4 h-4" />
        </InputGroupAddon>
      </InputGroup>
    </Motion>

    <div class="flex gap-2">
      <Button size="icon-sm" asChild class="rounded-full">
        <Link to="/settings">
          <Settings />
        </Link>
      </Button>
    </div> -->
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Motion } from "motion-v";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import Link from "@/components/ui/link/Link.vue";
import { useTheme } from "@/composables/useTheme";
import {
  Home,
  Search,
  Settings,
  Sun,
  Moon,
  Navigation,
  Menu,
} from "lucide-vue-next";
import { useSidebar } from "@/composables/useSidebar";
import { Icon } from "@iconify/vue";

const theme = useTheme();
const isSearchFocused = ref(false);

const themeIcon = computed(() => (theme.isDark.value ? Sun : Moon));

const handleThemeToggle = (event: MouseEvent) => {
  theme.toggleTheme(event);
};

const { toggleLeftSidebar } = useSidebar();
</script>
