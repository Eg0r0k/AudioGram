import js from "@eslint/js";
import typescript from "typescript-eslint";
import vue from "eslint-plugin-vue";
import globals from "globals";

export default typescript.config(
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/**"],
  },

  js.configs.recommended,
  ...typescript.configs.recommended,
  ...vue.configs["flat/recommended"],

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
    },
  }
);
