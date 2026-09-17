// Export CSV de l'aperçu de la Revue (Task 15). Séparateur `;` (Excel FR),
// `"` doublé quand la valeur en porte ou porte le séparateur/retour, BOM
// UTF-8 en tête du Blob pour que les accents passent à l'ouverture directe.
export function toCsv(rows: { id: number; url: string; title: string }[]): string {
  const esc = (s: string) => (/[",;\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  const lines = rows.map((r) => [r.id, r.url, r.title].map((v) => esc(String(v))).join(";"));
  return ["id;url;titre", ...lines].join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
