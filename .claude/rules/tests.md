---
description: Vitest scope and test conventions
paths:
  - 'src/lib/tests/**'
  - 'vitest.config.ts'
---

# Tests

Vitest config (`vitest.config.ts`) only collects tests from `src/lib/tests/**`. Environment is `node`, so tests should target pure logic (time parsing, utility helpers); DOM/Svelte component tests are not currently set up.

Run a single test file: `npx vitest run src/lib/tests/time-format.test.ts`
Run a single test by name: `npx vitest run -t "parses ISO"`
