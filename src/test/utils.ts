import { render, type RenderOptions } from "@testing-library/vue";
import { createPinia } from "pinia";
import { type Component } from "vue";
import { createI18n } from "vue-i18n";
import { createRouter, createWebHistory } from "vue-router";

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: "/", component: { template: "<div>Home</div>" } },
      { path: "/library", component: { template: "<div>Library</div>" } },
    ],
  });
}

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: "en",
    messages: {
      en: {},
      ru: {},
    },
  });
}

type BaseRenderOptions = RenderOptions<Record<string, unknown>>;

interface CustomRenderOptions extends Omit<BaseRenderOptions, "global"> {
  initialRoute?: string;
}
export function renderWithPlugins(
  component: Component,
  options: CustomRenderOptions = {},
) {
  const { initialRoute = "/", ...renderOptions } = options;

  const router = createTestRouter();
  const pinia = createPinia();
  const i18n = createTestI18n();

  router.push(initialRoute);

  return {
    ...render(component, {
      ...renderOptions,
      global: {
        plugins: [router, pinia, i18n],
      },
    }),
    router,
    pinia,
  };
}

export * from "@testing-library/vue";
export { default as userEvent } from "@testing-library/user-event";
