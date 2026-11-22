import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
    ...nextVitals,
    ...nextTs,
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "error",
        },
    },
    {
        // Data-access rule: only the DAL, the db module, and Better Auth may touch the database.
        files: ["src/**/*.{ts,tsx}"],
        ignores: ["src/server/dal/**", "src/db/**", "src/lib/auth.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["@/db", "@/db/*"],
                            message: "Akses database hanya lewat src/server/dal (lihat DECISIONS.md D-008).",
                        },
                    ],
                },
            ],
        },
    },
    globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "supabase/**"]),
]);