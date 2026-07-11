import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // These server-rendered pages intentionally snapshot wall-clock time. Keep
    // the exception local so new components still get React's purity checks.
    files: [
      "app/dashboard/proactive/page.tsx",
      "app/dashboard/psyche/page.tsx",
      "components/dashboard/MemoryTable.tsx",
    ],
    rules: { "react-hooks/purity": "off" },
  },
  {
    files: ["world/**/*.ts", "db/**/*.ts", "core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**"],
              message: "Domain and persistence modules cannot depend on Next.js routes or UI.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["world/**/*.ts", "db/**/*.ts"],
    ignores: ["world/tick.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**"],
              message: "Domain and persistence modules cannot depend on Next.js routes or UI.",
            },
            {
              group: ["@/core/runtime", "@/core/runtime/**"],
              message: "World rules and repositories cannot call runtime use cases.",
            },
            {
              group: ["@/telegram/**", "@/messaging/outbox"],
              message: "Only runtime orchestration may cross into message delivery.",
            },
          ],
        },
      ],
    },
  },
  {
    // `useMemories` is a domain verb in the server runtime, not a React hook.
    files: ["core/runtime.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
