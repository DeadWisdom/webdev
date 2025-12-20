import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow unused vars prefixed with _
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      // Allow explicit any in certain cases (can tighten later)
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow empty functions for interface stubs
      "@typescript-eslint/no-empty-function": "off",
      // Prefer const
      "prefer-const": "error",
      // No console in production code (warn for now)
      "no-console": "warn",
    },
  },
  {
    // Test files can be more relaxed
    files: ["**/*.test.ts", "**/*.browser-test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  {
    // Example files can use console
    files: ["examples/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: ["dist/**", "node_modules/**", "*.js"],
  }
);
