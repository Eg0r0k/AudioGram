<template>
  <a
    v-if="isExternalLink"
    v-bind="$attrs"
    :href="normalizedHref"
    :target="computedTarget"
    :rel="computedRel"
    :class="linkClass"
  >
    <slot />
  </a>
  <RouterLink
    v-else
    v-slot="{ isActive, isExactActive, href, route, navigate }"
    v-bind="routerLinkProps"
    custom
  >
    <a
      v-bind="$attrs"
      :href="href"
      :class="computedActiveClass(isActive, isExactActive)"
      :aria-current="isExactActive ? 'page' : undefined"
      @click="navigate"
    >
      <slot
        :is-active="isActive"
        :is-exact-active="isExactActive"
        :route="route"
      />
    </a>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed, HTMLAttributes } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";

type TargetType = "_blank" | "_self" | "_parent" | "_top";

interface LinkProps {
  to: RouteLocationRaw;
  target?: TargetType;
  class?: HTMLAttributes["class"];
  activeClass?: HTMLAttributes["class"];
  exactActiveClass?: HTMLAttributes["class"];
  inactiveClass?: HTMLAttributes["class"];
  disabled?: boolean;
  exactMatch?: boolean;
  rel?: string;
  replace?: boolean;
}

defineOptions({
  inheritAttrs: false,
});

const props = withDefaults(defineProps<LinkProps>(), {
  target: "_self",
  exactMatch: true,
  disabled: false,
  replace: false,
});

const isExternalLink = computed(() => {
  if (typeof props.to !== "string") return false;
  return (
    props.to.startsWith("http://")
    || props.to.startsWith("https://")
    || props.to.startsWith("mailto:")
    || props.to.startsWith("tel:")
    || props.to.startsWith("//")
  );
});

const normalizedHref = computed(() => {
  if (props.disabled) return undefined;
  return typeof props.to === "string" ? props.to : String(props.to);
});

const computedTarget = computed((): TargetType => {
  if (props.target) return props.target;

  if (typeof props.to === "string") {
    if (props.to.startsWith("mailto:") || props.to.startsWith("tel:")) {
      return "_self";
    }
  }

  return "_blank";
});

const computedActiveClass = (isActive: boolean, isExactActive: boolean) => {
  const active = props.exactMatch ? isExactActive : isActive;

  return [
    props.class,
    active ? props.exactActiveClass || props.activeClass : props.inactiveClass,
    { "link-disabled": props.disabled },
  ];
};

const linkClass = computed(() => {
  return [
    props.class,
    props.inactiveClass,
    { "link-disabled": props.disabled },
  ];
});

const routerLinkProps = computed(() => ({
  to: props.to,
  replace: props.replace,
}));

const computedRel = computed(() => {
  if (props.rel) return props.rel;

  if (computedTarget.value === "_blank") {
    return "noopener noreferrer";
  }

  return undefined;
});

defineExpose({
  isExternalLink,
});
</script>
