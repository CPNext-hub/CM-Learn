import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

// eslint-config-next 15 ships "legacy" (eslintrc) configs; FlatCompat converts them for ESLint 9 flat config.
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { ignores: [".next/**", ".open-next/**", "next-env.d.ts", "coverage/**"] },
  // Unit tests read API JSON loosely (res.json() → any), so `any` is allowed in tests only.
  { files: ["tests/**/*.ts"], rules: { "@typescript-eslint/no-explicit-any": "off" } },
];

export default eslintConfig;
