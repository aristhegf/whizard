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
    // BeUI components, added with `npx shadcn add @beui/…` and kept as published.
    files: ["apps/web/src/components/motion/**", "apps/web/src/lib/**"],
    rules: {
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Originkit components (originkit.dev), kept as published. Its inner component's name starts
    // with an underscore, which the hooks rule mistakes for a plain function.
    files: ["apps/web/src/components/originkit/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "no-useless-assignment": "off",
    },
  },
  {
    // Cult UI components (cult-ui.com), added with `npx shadcn add` and kept as published.
    files: ["apps/web/src/components/cult/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: [
      "*.{js,ts}",
      "apps/web/vite.config.ts",
      "apps/server/scripts/**/*.mjs",
      "packages/*/scripts/**/*.mjs",
    ],
    languageOptions: { globals: globals.node },
  },
);
