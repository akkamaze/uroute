import eslint from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/builds/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@stylistic": stylistic,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "directive", next: "*" },
        { blankLine: "any", prev: "directive", next: "directive" },
        { blankLine: "always", prev: "*", next: "return" },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: "module",
    },
  },
);
