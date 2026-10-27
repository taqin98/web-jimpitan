import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

const gasGlobals = Object.fromEntries(
  [
    "SpreadsheetApp",
    "LockService",
    "CacheService",
    "PropertiesService",
    "Utilities",
    "ContentService",
    "Logger",
    "Session",
  ].map((name) => [name, "readonly"]),
);

export default [
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  {
    rules: {
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-var": "error",
      "prefer-const": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
    },
  },
  {
    // Frontend (GitHub Pages)
    files: ["docs/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      "no-restricted-properties": [
        "error",
        {
          property: "innerHTML",
          message:
            "Gunakan textContent untuk data pengguna (spesifikasi bagian 8). Untuk templat statis, beri eslint-disable-next-line beserta alasan.",
        },
      ],
    },
  },
  {
    // Backend (Google Apps Script)
    files: ["apps-script/**/*.gs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: gasGlobals,
    },
    rules: {
      "no-unused-vars": "off", // fungsi dipanggil oleh runtime Apps Script / file lain
      "no-undef": "off", // fungsi antar file berbagi ruang global
    },
  },
  {
    // File konfigurasi di akar repo
    files: ["*.js"],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier, // harus terakhir
];
