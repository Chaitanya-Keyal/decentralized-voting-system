// One ESLint config for the whole workspace. Run `pnpm lint` from the repo root.
import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const WEB_DIR = "apps/web";

// Next.js's rules apply to the web app only; each of its file globs is moved under apps/web.
// Its global-ignore entry is dropped, since the ignores below already cover those folders.
const isGlobalIgnore = (config) => Object.keys(config).length === 1 && "ignores" in config;
const nextForWeb = nextVitals
  .filter((config) => !isGlobalIgnore(config))
  .map((config) => ({
    ...config,
    files: (config.files ?? ["**/*.{js,jsx,mjs,ts,tsx}"]).map((glob) => `${WEB_DIR}/${glob}`),
  }));

export default defineConfig([
  globalIgnores([
    "**/node_modules/",
    "**/.next/",
    "**/dist/",
    "**/out/",
    "**/build/",
    "**/next-env.d.ts",
    "contracts/",
    "reports/",
    "docs/",
    "bench/",
  ]),

  js.configs.recommended,
  ...nextForWeb,
  {
    files: [`${WEB_DIR}/**`],
    settings: {
      next: { rootDir: `${WEB_DIR}/` },
      react: { version: "19" },
    },
  },

  // Type-aware TypeScript rules everywhere; each file uses its package's tsconfig.
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "smart"],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/api/**", "packages/**"],
    languageOptions: { globals: globals.node },
  },

  // Last, so formatting is left entirely to Prettier.
  prettier,
]);
