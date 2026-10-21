import { copyFileSync } from "node:fs";

// tsup 6 emits one self-contained declaration. NodeNext consumers of the CJS
// export need the equivalent .d.cts so TypeScript treats it as CommonJS.
copyFileSync(
  new URL("../dist/index.d.ts", import.meta.url),
  new URL("../dist/index.d.cts", import.meta.url)
);
