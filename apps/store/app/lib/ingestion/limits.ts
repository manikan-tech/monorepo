// Upload caps for size-chart ingestion.
//
// These are not decoration: Step 1 runs the whole parse -> validate -> commit
// pipeline INSIDE the request, with no queue to fall back to. These two
// numbers are what actually bound that decision. "We'll move to a real queue
// when files get large" is only true because something rejects large files.
//
// Both live here rather than inline at the call site so that promoting to a
// background worker later is a change to two constants in one file, and so the
// error copy and the enforcement can never disagree about the threshold.
//
// For scale: the entire demo catalog CSV in this repo is 393 rows, so the row
// cap is ~12x the largest real file we have, while still parsing and
// committing comfortably within a request.

export const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_CSV_ROWS = 5_000;

export function formatMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

export const LIMIT_MESSAGES = {
  notCsv: "File must be a .csv",
  tooLarge: (bytes: number) =>
    `CSV must be ${formatMb(MAX_CSV_BYTES)}MB or smaller (received ${formatMb(bytes)}MB)`,
  tooManyRows: (rows: number) =>
    `CSV must contain ${MAX_CSV_ROWS} rows or fewer (received ${rows})`,
} as const;
