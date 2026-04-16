import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

/** @type {import('eslint').Linter.Config[]} */
const config = [
    ...nextCoreWebVitals,
    ...nextTypescript,
    prettierConfig,
    {
        ignores: [
            "node_modules/**",
            ".next/**",
            ".next-e2e/**",
            "out/**",
            "build/**",
            "coverage/**",
            "playwright-report/**",
            "test-results/**",
            "ffmpeg_temp/**",
            "next-env.d.ts",
            "public/**",
            "**/*.log",
            "**/*.ipynb",
        ],
    },
];

export default config;
