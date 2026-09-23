// Export CSV de l'aperçu de la Revue (Task 15). Séparateur `;` (Excel FR),
// `"` doublé quand la valeur en porte ou porte le séparateur/retour, BOM
// UTF-8 en tête du Blob pour que les accents passent à l'ouverture directe.
//
// Injection de formule (audit du 2026-09-23) : les titres viennent des PAGES,
// donc de tiers — « =HYPERLINK(…) » s'exécuterait à l'ouverture dans un
// tableur. Une cellule qui commence par = + - @ (ou tabulation/retour) prend
// une apostrophe en tête : le tableur l'affiche en texte (parade OWASP).
export function toCsv(rows: { id: number; url: string; title: string }[]): string {
  const neutre = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
  const esc = (brut: string) => {
    const s = neutre(brut);
    return /[",;\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
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
