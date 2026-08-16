import { render, type RenderOptions } from "@testing-library/vue";
import { createPinia } from "pinia";
import { type Component } from "vue";
import { createI18n } from "vue-i18n";
import { createRouter, createWebHistory } from "vue-router";
import { ROUTE_NAMES } from "@/app/router/route-names";
import { messages } from "@/app/i18n/messages";

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: "/", name: ROUTE_NAMES.HOME, component: { template: "<div>Home</div>" } },
      { path: "/library", name: "library", component: { template: "<div>Library</div>" } },
    ],
  });
}

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: "en",
    messages,
  });
}

type BaseRenderOptions = RenderOptions<Record<string, unknown>>;

interface CustomRenderOptions extends Omit<BaseRenderOptions, "global"> {
  initialRoute?: string;
  stubs?: Record<string, unknown>;
}
export function renderWithPlugins(
  component: Component,
  options: CustomRenderOptions = {},
) {
  const { initialRoute = "/", stubs, ...renderOptions } = options;

  const router = createTestRouter();
  const pinia = createPinia();
  const i18n = createTestI18n();

  router.push(initialRoute);

  return {
    ...render(component, {
      ...renderOptions,
      global: {
        plugins: [router, pinia, i18n],
        ...(stubs ? { stubs } : {}),
      },
    }),
    router,
    pinia,
  };
}

export * from "@testing-library/vue";
export { default as userEvent } from "@testing-library/user-event";
