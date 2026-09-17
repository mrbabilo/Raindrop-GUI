// DESIGN.md §9 : icône dessinée en SVG au TRAIT, jamais pleine — trait 1,7
// sur grille 15–16, comme les glyphes de nature (glyphes.tsx) ; l'état
// favori ne change pas le remplissage. Unique étoile de l'interface : elle
// se dessine ICI — RaindropRow (liste) et DetailPane (fiche) la consomment
// (revue finale : l'étoile pleine 13 px de la liste était un reste de la
// Task 7b, tranché par le FIX ledger).
export function Etoile() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round">
      <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
    </svg>
  );
}
