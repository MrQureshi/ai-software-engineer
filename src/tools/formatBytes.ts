/**
 * Convert a number of bytes into a human‑readable string using binary (base‑1024) units.
 *
 * @param bytes - The number of bytes. Non‑positive values return "0 B".
 * @param decimals - Number of decimal places to include (default 2).
 * @returns A formatted string, e.g. "1.23 MB".
 * @example
 *   formatBytes(0) // "0 B"
 *   formatBytes(1024) // "1 KB"
 *   formatBytes(123456789, 1) // "117.7 MB"
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes <= 0) {
    return "0 B";
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  const fixed = size.toFixed(dm);
  // Remove trailing zeros and optional decimal point
  const trimmed = dm > 0 ? fixed.replace(/\.0+$|(?:(\.\d*?)0+$)/, "$1").replace(/\.$/, "") : fixed;
  return `${trimmed} ${sizes[i]}`;
}
