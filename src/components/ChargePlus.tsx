import { useRef } from "react";
import { t } from "../i18n/fr";

// Sentinelle du défilement infini : se rend invisible sans page suivante, et
// déclenche `fetchNextPage` dès qu'elle entre dans le champ. Partagé par la
// liste principale et les vues de nettoyage — les deux implémentations
// étaient identiques à la prop près (ROADMAP, « Divers »).
export function ChargePlus({ q }: { q: { hasNextPage?: boolean; isFetchingNextPage: boolean; fetchNextPage: () => void } }) {
  const ioRef = useRef<IntersectionObserver | null>(null);
  if (!q.hasNextPage) return null;
  return (
    <div
      // Le callback ref tourne à chaque rendu — on débranche l'observeur
      // précédent avant d'en créer un (sinon N rendus = N observateurs =
      // N× fetchNextPage au même event).
      ref={(el) => {
        ioRef.current?.disconnect();
        if (!el) return;
        const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && q.fetchNextPage()));
        io.observe(el);
        ioRef.current = io;
      }}
      className="p-4 text-center text-app-muted"
    >
      {q.isFetchingNextPage ? t("list.loadingMore") : ""}
    </div>
  );
}
