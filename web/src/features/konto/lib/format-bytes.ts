/** Menschenlesbare Groesse - unter 1 MB in KB (gerundet), sonst in MB mit einer Nachkommastelle. */
export function formatBytes(bytes: number): string {
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
