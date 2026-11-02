// Types Astro's `Astro.locals` / `context.locals` for every app that references this file
// from its src/env.d.ts.
import type { GamoLocals } from './locals.ts';

declare global {
  namespace App {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Locals extends GamoLocals {}
  }
}

export {};
