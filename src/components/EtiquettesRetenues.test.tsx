import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppStateProvider, useAppState } from "../state/appState";
import { useFiltreEtiquettes } from "../hooks/filtreEtiquettes";
import { EtiquettesRetenues } from "./EtiquettesRetenues";

// Harnais : la rangée ne pose pas les étiquettes, elle les montre. On lui
// donne donc de vrais boutons qui passent par le MÊME chemin que les pilules
// de la liste (useFiltreEtiquettes.bascule) — un test qui écrirait `tags`
// dans l'état à la main ne prouverait rien du câblage.
function Harnais({ proposees }: { proposees: string[] }) {
  const { bascule } = useFiltreEtiquettes();
  const { view } = useAppState();
  return (
    <>
      {proposees.map((n) => (
        <button key={n} type="button" onClick={() => bascule(n)}>
          poser {n}
        </button>
      ))}
      <EtiquettesRetenues />
      <output data-testid="etat">{view.kind === "list" ? (view.tags ?? []).join(",") : "—"}</output>
    </>
  );
}

const monter = (proposees: string[]) =>
  render(
    <AppStateProvider>
      <Harnais proposees={proposees} />
    </AppStateProvider>,
  );

describe("EtiquettesRetenues", () => {
  it("n'affiche RIEN tant qu'aucune étiquette n'est retenue", async () => {
    // L'absence ne vaut qu'après avoir montré la présence : on prouve d'abord
    // que la rangée s'affiche bien quand il y a quelque chose à afficher.
    monter(["code"]);
    expect(screen.queryByText("Étiquette retenue")).toBeNull();
    await userEvent.click(screen.getByText("poser code"));
    expect(screen.getByText("Étiquette retenue")).toBeInTheDocument();
  });

  it("accorde son libellé en nombre", async () => {
    monter(["code", "webdesign"]);
    await userEvent.click(screen.getByText("poser code"));
    expect(screen.getByText("Étiquette retenue")).toBeInTheDocument();
    await userEvent.click(screen.getByText("poser webdesign"));
    expect(screen.getByText("Étiquettes retenues")).toBeInTheDocument();
  });

  it("deux étiquettes s'INTERSECTENT, et la rangée le dit", async () => {
    monter(["code", "webdesign"]);
    await userEvent.click(screen.getByText("poser code"));
    await userEvent.click(screen.getByText("poser webdesign"));
    expect(screen.getByTestId("etat")).toHaveTextContent("code,webdesign");
    expect(screen.getByText("et")).toBeInTheDocument();
  });

  it("cliquer une pilule retenue la RETIRE (l'aller ne prouve rien sans le retour)", async () => {
    monter(["code", "webdesign"]);
    await userEvent.click(screen.getByText("poser code"));
    await userEvent.click(screen.getByText("poser webdesign"));
    await userEvent.click(screen.getByRole("button", { name: "Retirer l'étiquette code" }));
    expect(screen.getByTestId("etat")).toHaveTextContent("webdesign");
    // Et la pilule a bien disparu de la rangée, pas seulement de l'état.
    expect(screen.queryByRole("button", { name: "Retirer l'étiquette code" })).toBeNull();
  });

  it("la pilule retenue se déclare pressée — le clic va DÉFAIRE", async () => {
    monter(["code"]);
    await userEvent.click(screen.getByText("poser code"));
    expect(screen.getByRole("button", { name: "Retirer l'étiquette code" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("« tout retirer » n'apparaît qu'à partir de deux, et vide la rangée", async () => {
    monter(["code", "webdesign"]);
    await userEvent.click(screen.getByText("poser code"));
    expect(screen.queryByRole("button", { name: "Retirer toutes les étiquettes" })).toBeNull();
    await userEvent.click(screen.getByText("poser webdesign"));
    await userEvent.click(screen.getByRole("button", { name: "Retirer toutes les étiquettes" }));
    expect(screen.getByTestId("etat")).toHaveTextContent("");
    expect(screen.queryByText("Étiquettes retenues")).toBeNull();
  });
});
