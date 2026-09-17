import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { useRovingFocus, type RovingOptions } from "./useRovingFocus";

function Zone({ noms, ...options }: { noms: string[] } & RovingOptions) {
  const ref = useRef<HTMLDivElement>(null);
  const roving = useRovingFocus(ref, options);
  return (
    <div ref={ref} onKeyDown={roving.surTouche}>
      {noms.map((n) => (
        <button key={n} type="button" data-nav>{n}</button>
      ))}
      <button type="button">hors zone</button>
    </div>
  );
}

// Une zone qui gagne des éléments en cours de route — un groupe qu'on déplie.
function ZoneVariable() {
  const ref = useRef<HTMLDivElement>(null);
  const [ouvert, setOuvert] = useState(false);
  const roving = useRovingFocus(ref);
  return (
    <div ref={ref} onKeyDown={roving.surTouche}>
      <button type="button" data-nav onClick={() => setOuvert(true)}>parent</button>
      {ouvert && <button type="button" data-nav>enfant</button>}
      <button type="button" data-nav>suivant</button>
    </div>
  );
}

const tabIndexDe = (nom: string) => screen.getByRole("button", { name: nom }).tabIndex;

describe("useRovingFocus", () => {
  // Le grief : plus de 250 arrêts de tabulation dans la barre latérale, un
  // par étiquette. Une zone n'en prend qu'un.
  it("la zone ne prend qu'un seul arrêt de tabulation", () => {
    render(<Zone noms={["a", "b", "c"]} />);
    expect(tabIndexDe("a")).toBe(0);
    expect(tabIndexDe("b")).toBe(-1);
    expect(tabIndexDe("c")).toBe(-1);
  });

  it("les flèches verticales circulent et emmènent l'arrêt avec elles", async () => {
    render(<Zone noms={["a", "b", "c"]} />);
    screen.getByRole("button", { name: "a" }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: "b" })).toHaveFocus();
    expect(tabIndexDe("b")).toBe(0);
    expect(tabIndexDe("a")).toBe(-1);
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "a" })).toHaveFocus();
  });

  // Aux extrémités, on ne boucle pas : arriver au bout d'une liste de 12 000
  // lignes pour se retrouver en tête serait une perte de repère.
  it("ne boucle pas aux extrémités", async () => {
    render(<Zone noms={["a", "b"]} />);
    screen.getByRole("button", { name: "a" }).focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: "a" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("button", { name: "b" })).toHaveFocus();
  });

  it("Début et Fin sautent aux extrémités", async () => {
    render(<Zone noms={["a", "b", "c"]} />);
    screen.getByRole("button", { name: "a" }).focus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("button", { name: "c" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "a" })).toHaveFocus();
  });

  // Sur une liste plate, les flèches horizontales appartiennent au texte :
  // les confisquer casserait la saisie sans rien apporter.
  it("les flèches horizontales ne sont prises que si la zone les traite", async () => {
    const surHorizontale = vi.fn();
    const { unmount } = render(<Zone noms={["a"]} surHorizontale={surHorizontale} />);
    screen.getByRole("button", { name: "a" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(surHorizontale).toHaveBeenCalledWith(expect.anything(), "droite");
    await userEvent.keyboard("{ArrowLeft}");
    expect(surHorizontale).toHaveBeenCalledWith(expect.anything(), "gauche");
    unmount();

    render(<Zone noms={["a"]} />); // sans traitement : rien n'est consommé
    screen.getByRole("button", { name: "a" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "a" })).toHaveFocus();
  });

  it("Échap rend la main à qui l'a demandé", async () => {
    const surEchap = vi.fn();
    render(<Zone noms={["a"]} surEchap={surEchap} />);
    screen.getByRole("button", { name: "a" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(surEchap).toHaveBeenCalled();
  });

  // Un élément hors de la zone garde son arrêt : le roving ne régit que
  // ce qui se déclare `data-nav`.
  it("ne touche pas aux éléments qui ne se déclarent pas", () => {
    render(<Zone noms={["a"]} />);
    expect(tabIndexDe("hors zone")).toBe(0);
  });

  // Déplier un groupe ajoute des éléments : ils naîtraient tous tabulables
  // sans remise à plat à chaque rendu.
  it("les éléments apparus en cours de route n'ajoutent pas d'arrêt", async () => {
    render(<ZoneVariable />);
    await userEvent.click(screen.getByRole("button", { name: "parent" }));
    expect(screen.getByRole("button", { name: "enfant" }).tabIndex).toBe(-1);
    expect(screen.getByRole("button", { name: "suivant" }).tabIndex).toBe(-1);
    expect(screen.getByRole("button", { name: "parent" }).tabIndex).toBe(0);
  });
});
