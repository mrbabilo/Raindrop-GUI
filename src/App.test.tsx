import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("affiche le titre de l'app", () => {
    render(<App />);
    expect(screen.getByText("Raindrop GUI")).toBeInTheDocument();
  });

  it("affiche le shell trois panneaux (navigation, liste, détail)", () => {
    render(<App />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("bascule le thème sombre au clic sur le bouton de thème", async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole("button", { name: "Passer au thème sombre" });
    await user.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Passer au thème clair" }),
    ).toBeInTheDocument();
  });
});
