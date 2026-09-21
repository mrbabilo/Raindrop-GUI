import { describe, it, expect } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { gzipSync } from "node:zlib";
import { repertoireTemporaire } from "../testing/tmp.js";
import { lireContenu, LECTURE_MAX_OCTETS } from "./contenuArchive.js";

// `repertoireTemporaire` rend une string, pas une fabrique (trap lot 09-18).
const dir = () => repertoireTemporaire("lecture-contenu-");

const poser = async (id: number, octets: Buffer, base = dir()): Promise<string> => {
  const dossier = join(base, "archives");
  await mkdir(dossier, { recursive: true });
  await writeFile(join(dossier, `${id}.html.gz`), octets);
  return dossier;
};

const corps = async (v: Awaited<ReturnType<typeof lireContenu>>): Promise<string> =>
  v.ok ? await text(Readable.fromWeb(v.flux as unknown as NodeReadableStream)) : "";

describe("lireContenu", () => {
  it("sert le HTML DÉCOMPRIMÉ, fidèle à l'archive (spec lecture §3)", async () => {
    const original = "<html><body><p>bonjour</p></body></html>";
    const dossier = await poser(42, gzipSync(Buffer.from(original)));
    const v = await lireContenu(dossier, 42);
    expect(v.ok).toBe(true);
    expect(await corps(v)).toBe(original); // décompressé, et PAS autre chose
    if (v.ok) expect(Number.isNaN(new Date(v.dateIso).getTime())).toBe(false);
  });

  it("sans archive : « introuvable », jamais une 500 (404 nommé de la spec §5)", async () => {
    const dossier = await poser(42, gzipSync(Buffer.from("x")));
    const v = await lireContenu(dossier, 99);
    expect(v).toMatchObject({ ok: false, raison: "introuvable" });
  });

  it("un fichier qui n'est pas du gzip est « illisible » AVANT tout flux", async () => {
    const dossier = await poser(42, Buffer.from("<html>pas gzip</html>"));
    const v = await lireContenu(dossier, 42);
    expect(v).toMatchObject({ ok: false, raison: "illisible" });
  });

  it("une archive trop courte n'est pas un gzip", async () => {
    const dossier = await poser(42, Buffer.from([0x1f, 0x8b])); // la magie seule
    const v = await lireContenu(dossier, 42);
    expect(v).toMatchObject({ ok: false, raison: "illisible" });
  });

  it("la garde de 64 Mo coupe sur l'ISIZE, avec sa raison (spec lecture §3)", async () => {
    // Fixture HONNÊTE pour le garde : un vrai petit gzip dont on RÉÉCRIT les
    // 4 octets d'ISIZE à 65 Mo. Le garde lit l'ISIZE avant tout flux — la
    // fixture exerce exactement ce qu'il lit, sans 64 Mo sur le disque.
    const vrai = gzipSync(Buffer.from("<html>petit</html>"));
    const annonce = Buffer.from(vrai);
    annonce.writeUInt32LE(65 * 2 ** 20, annonce.length - 4);
    const dossier = await poser(42, annonce);
    const v = await lireContenu(dossier, 42);
    expect(v).toMatchObject({ ok: false, raison: "trop-volumineuse" });
    if (!v.ok) expect(v.detail).toMatch(/64 Mo/);
  });

  it("la garde est à 64 Mo exactement — la constante que la spec a bornée", () => {
    expect(LECTURE_MAX_OCTETS).toBe(64 * 2 ** 20);
  });

  it("un gz corrompu AU CORPS interrompt le flux sans plante — le refus du front, pas du serveur", async () => {
    const vrai = gzipSync(Buffer.from("<html>" + "x".repeat(400) + "</html>"));
    const faux = Buffer.from(vrai);
    faux.fill(0x00, 10, faux.length - 8); // corps n'importe quoi
    faux.writeUInt32LE(400, faux.length - 4); // ISIZE crédible : les contrôles à froid passent
    const dossier = await poser(42, faux);
    const v = await lireContenu(dossier, 42);
    expect(v.ok).toBe(true); // rien ne le détecte à froid : c'est À MI-FLUX que ça casse
    await expect(corps(v)).rejects.toThrow();
  });
});
