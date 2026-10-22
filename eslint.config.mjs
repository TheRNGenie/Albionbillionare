// Lint rules for Albion Billionaire v2: `npm run lint`. The app is plain browser scripts that share one global (AB),
// so the rules are ESLint's correctness checks with the browser, Node and Electron globals each part of the code uses.
const browser = ["window", "document", "localStorage", "sessionStorage", "fetch", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "location", "URL", "URLSearchParams", "Blob", "Intl", "indexedDB", "AbortController", "performance", "console", "navigator", "getComputedStyle", "ResizeObserver", "IntersectionObserver", "MutationObserver", "HTMLElement", "Element", "Event", "CustomEvent", "history", "innerWidth", "innerHeight", "scrollY", "devicePixelRatio", "FileReader", "File", "Image", "CSS", "queueMicrotask", "structuredClone", "alert", "confirm", "AB", "Capacitor", "KeyboardEvent", "PointerEvent", "TextEncoder", "crypto", "FormData", "Response"];
const node = ["require", "process", "module", "__dirname", "Buffer"];
const rules = {
  "no-unused-vars": ["warn", { args: "after-used", caughtErrors: "none", ignoreRestSiblings: true }],
  "no-undef": "error", "no-redeclare": "error", "no-dupe-keys": "error", "no-dupe-args": "error", "no-duplicate-case": "error",
  "no-unreachable": "error", "no-self-assign": "error", "no-self-compare": "error", "no-constant-condition": ["warn", { checkLoops: false }],
  "no-fallthrough": "error", "no-sparse-arrays": "error", "no-unsafe-negation": "error", "use-isnan": "error", "valid-typeof": "error",
  "no-empty": ["warn", { allowEmptyCatch: true }], "no-cond-assign": "warn", "no-loss-of-precision": "error", "no-unused-private-class-members": "warn",
  "no-shadow-restricted-names": "error", "no-useless-escape": "warn", "no-unmodified-loop-condition": "warn", "no-unused-expressions": ["warn", { allowShortCircuit: true, allowTernary: true }],
  "no-dupe-else-if": "error", "no-import-assign": "error", "no-irregular-whitespace": "error", "no-prototype-builtins": "warn", "no-case-declarations": "warn",
};
export default [
  { ignores: ["www/", "android/", "dist/", "node_modules/"] },
  { files: ["assets/js/**/*.js"], languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: Object.fromEntries(browser.map((g) => [g, "readonly"])) }, rules },
  { files: ["tests/**/*.mjs", "tools/**/*.mjs"], languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: Object.fromEntries([...browser, ...node].map((g) => [g, "readonly"])) }, rules },
  { files: ["desktop/**/*.js"], languageOptions: { ecmaVersion: 2023, sourceType: "commonjs", globals: Object.fromEntries([...browser, ...node].map((g) => [g, "readonly"])) }, rules },
];
