import js from "@eslint/js";
import typescript from "typescript-eslint";
import vue from "eslint-plugin-vue";
import { withVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import globals from "globals";
import vuejsAccessibility from "eslint-plugin-vuejs-accessibility";
import stylistic from "@stylistic/eslint-plugin";
import importX from "eslint-plugin-import-x";
import sonarjs from "eslint-plugin-sonarjs";

export default withVueTs(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      // Stale git worktrees of old branches: a full copy of src/, which
      // tripled every report here.
      ".claude/**",
      "**/__tests__/**",
      "**/__test__/**",
      // Tests are exempt wherever they live — a co-located *.test.ts is the
      // same kind of file as one under __tests__/.
      "**/*.test.ts",
    ],
  },

  js.configs.recommended,
  ...vue.configs["flat/recommended"],
  vueTsConfigs.recommendedTypeChecked,
  ...vuejsAccessibility.configs["flat/recommended"],
  sonarjs.configs.recommended,

  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      // A written `default` is a deliberate "everything else" branch; without
      // this flag the rule demands every union member be spelled out anyway.
      "@typescript-eslint/switch-exhaustiveness-check": ["error", {
        considerDefaultExhaustiveForUnions: true,
      }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },

  {
    files: ["**/*.js", "src/test/**", "**/*.spec.ts"],
    extends: [typescript.configs.disableTypeChecked],
    languageOptions: {
      parserOptions: { projectService: false, project: false },
    },
  },

  stylistic.configs.customize({
    indent: 2,
    quotes: "double",
    semi: true,
    jsx: false,
  }),

  {
    languageOptions: {
      globals: {
        ...globals.browser,
        __APP_VERSION__: "readonly",
        __BUILD_TIME__: "readonly",
      },
    },
  },

  {
    files: ["**/*.{ts,vue}"],
    plugins: {
      "import-x": importX,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
    rules: {
      "import-x/no-cycle": "error",
      "import-x/no-self-import": "error",
      "import-x/no-duplicates": "error",
    },
  },

  // Data-access layering: Dexie and the repositories are reachable only from
  // the data layer — the repositories themselves, the query functions, and
  // the services (both the app-wide ones and the module-owned ones, which
  // are the same role co-located with their module). Everything above them —
  // `lib/`, composables, stores, components — goes through a query function
  // or a service. `lib/` is deliberately NOT exempt: it exists in every
  // module, so allowing it would drain the whole data layer into it.
  {
    files: ["src/**/*.{ts,vue}"],
    ignores: [
      "src/db/repositories/**",
      "src/queries/**",
      "src/services/**",
      "src/modules/*/service/**",
      "src/modules/*/services/**",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        // `paths` matches the module specifier exactly, so banning the `db`
        // export here leaves `openDatabase` (bootstrap) and every other
        // module under @/db — entities, storage, errors — alone. A `patterns`
        // group cannot: ESLint matches groups gitignore-style, so "@/db"
        // would swallow "@/db/entities" with it.
        paths: [
          {
            name: "@/db",
            importNames: ["db"],
            message: "db.table напрямую — только внутри репозитория.",
            allowTypeImports: true,
          },
        ],
        patterns: [
          {
            group: [
              "**/db/repositories",
              "**/db/repositories/**",
              "@/db/repositories",
              "@/db/repositories/**",
            ],
            message:
              "Репозитории доступны только из queries/ и services/. "
              + "Из composables и компонентов ходи через query-функции.",
            allowTypeImports: true,
          },
        ],
      }],
    },
  },

  {
    rules: {
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-void": "error",

      "vue/max-attributes-per-line": [
        "warn",
        {
          singleline: { max: 1 },
          multiline: { max: 1 },
        },
      ],
      // Accessibility
      "vuejs-accessibility/alt-text": "warn",
      "vuejs-accessibility/iframe-has-title": "warn",
      "sonarjs/no-duplicate-string": ["warn", { threshold: 5 }],
      "sonarjs/cognitive-complexity": ["warn", 20],
      "sonarjs/todo-tag": "off",

      "sonarjs/function-return-type": "off",

      "sonarjs/no-selector-parameter": "off",

      "sonarjs/deprecation": "warn",
    },
  },
);
