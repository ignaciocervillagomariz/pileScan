declare const PILESCAN_BUILD: string | undefined;

/**
 * "<commit> <UTC time>", compiled in by `npm run build` (scripts/build.mjs). Plain `ng serve`
 * and the unit tests have no stamp and report "dev".
 */
export const BUILD_STAMP: string = typeof PILESCAN_BUILD === 'string' ? PILESCAN_BUILD : 'dev';
