import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "./App";

describe("App", () => {
  it("affiche le titre de l'app", () => {
    render(<App />);
    expect(screen.getByText("Raindrop GUI")).toBeInTheDocument();
  });
});
