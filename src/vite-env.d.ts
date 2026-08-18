/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/// <reference types="vite/client" />
/// <reference types="unplugin-icons/types/vue" />
/// <reference types="vite-plugin-pwa/vue" />

// ?raw icon imports resolve to the svg markup string, not a component.
// Per-collection patterns on purpose: their prefix ("~icons/tabler/") is
// longer than unplugin-icons' own "~icons/*", so TS picks them for ?raw
declare module "~icons/tabler/*?raw" {
  const svg: string;
  export default svg;
}
declare module "~icons/audiogram/*?raw" {
  const svg: string;
  export default svg;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_DISCORD_CLIENT_ID?: string;
}
