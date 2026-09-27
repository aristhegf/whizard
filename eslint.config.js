import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/", "**/.wrangler/", "**/coverage/", "**/worker-configuration.d.ts"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat["recommended-latest"]],
    languageOptions: { globals: globals.browser },
    rules: {
      // The content package holds the answers; it must never be bundled into the browser.
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "@whizard/content", message: "Server-only: it contains the answers." }] },
      ],
    },
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["*.{js,ts}", "apps/web/vite.config.ts"],
    languageOptions: { globals: globals.node },
  },
);
