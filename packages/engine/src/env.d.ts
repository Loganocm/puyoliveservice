/**
 * The engine's entire dependency on its host environment.
 *
 * tsconfig.json compiles this package with `lib: ["ES2022"]` and `types: []`,
 * so neither the DOM nor Node's globals are in scope. That is deliberate: it
 * turns "the engine package stays pure" from a comment into a compile error.
 *
 * `console.warn` is the one exception. Both the board's grid-data guard and the
 * engine's out-of-bounds lock guard report through it, and both are worth
 * keeping -- a silent guard is a guard you find out about from a bug report.
 * `warn` is also the one console method production builds never silence
 * (website/src/content/docs/reference/configuration.md, "Logging"), so it is the right channel for these.
 *
 * Declared narrowly on purpose: only `warn`, and nothing else from the host.
 */
declare const console: {
    warn(...data: unknown[]): void;
};
