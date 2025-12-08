import js from "@eslint/js";
import typescript from "typescript-eslint";
import vue from "eslint-plugin-vue";
import globals from "globals";
import vuejsAccessibility from "eslint-plugin-vuejs-accessibility";
import stylistic from "@stylistic/eslint-plugin";

export default typescript.config(
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/**"],
  },

  js.configs.recommended,
  ...typescript.configs.recommended,
  ...vue.configs["flat/recommended"],
  ...vuejsAccessibility.configs["flat/recommended"],

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
      },
    },
  },

  {
    files: ["**/*.vue"],
    languageOptions: {
      parserOptions: {
        parser: typescript.parser,
      },
    },
  },

  {
    rules: {
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",

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
    },
  },
);
