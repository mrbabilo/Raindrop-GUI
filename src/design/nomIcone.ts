/**
 * Le nom ET l'infobulle d'une commande en icône seule (DESIGN §9).
 *
 * « Une icône par geste » retire le texte : à la souris, rien ne nommait
 * plus un crayon ou un engrenage — l'aria-label ne parle qu'au lecteur
 * d'écran. L'infobulle native (`title`) le dit à tous, sans rien poser à
 * l'écran. Sans raccourci, `title` fait aussi le nom accessible : une seule
 * source, pas de double annonce. Avec un raccourci, le nom reste nu
 * (`aria-label`) et l'infobulle l'annonce — c'est là qu'on le découvre.
 */
export function nomIcone(nom: string, raccourci?: string): { title: string; "aria-label"?: string } {
  return raccourci === undefined ? { title: nom } : { "aria-label": nom, title: `${nom} (${raccourci})` };
}
