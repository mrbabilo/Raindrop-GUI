import { describe, it, expect } from "vitest";
import { connectFake } from "../testing/fakeServer.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpConnection } from "./connection.js";

const inMemoryFactory = async (fakeOpts?: Parameters<typeof connectFake>[0]) => {
  const { client, server } = await connectFake(fakeOpts);
  const factory = {
    // Le transport côté "connexion" est celui du client existant : on le réutilise.
    create: async (): Promise<Transport> => {
      throw new Error("use prebuilt pair");
    },
  };
  return { client, server, factory };
};

describe("McpConnection", () => {
  it("parse le JSON de succès en CallOutcome ok", async () => {
    const { client } = await inMemoryFactory();
    // Connexion directe autour du client déjà connecté :
    const conn = McpConnection.fromClient(client);
    const out = await conn.call<{ fullName: string }>("get_user", {});
    // PAS de `bookmarksCount` : le vrai `/user` de Raindrop n'en porte aucun
    // (vérifié en réel le 2026-09-18), et le faux serveur est désormais
    // fidèle sur ce point. Le compte se dérive ailleurs — d'une lecture de la
    // collection 0, dans `routes/user.ts`.
    expect(out).toEqual({ ok: true, data: { id: 42, email: "moi@example.com", fullName: "Utilisateur Test", pro: true } });
    await conn.close();
  });

  it("classe une réponse 'Error: …' en RAINDROP_API", async () => {
    const { client } = await inMemoryFactory({ failTools: ["get_user"] });
    const conn = McpConnection.fromClient(client);
    const out = await conn.call("get_user", {});
    expect(out).toMatchObject({ ok: false, code: "RAINDROP_API" });
    await conn.close();
  });

  it("classe un timeout en MCP_TIMEOUT", async () => {
    const { client, server } = await inMemoryFactory();
    // Adaptation : l'aller-retour InMemory se résout en microtâches, donc plus
    // vite que n'importe quel setTimeout réel — avec get_user, la réponse gagne
    // toujours la course contre le timer de 1 ms. On utilise un tool
    // réellement lent (50 ms) pour que le timeout de 1 ms déclenche.
    server.registerTool("slow_tool", { inputSchema: {} }, async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { content: [{ type: "text" as const, text: "{}" }] };
    });
    const conn = McpConnection.fromClient(client);
    const out = await conn.call("slow_tool", {}, 1); // 1 ms < 50 ms : timeout garanti
    expect(out).toMatchObject({ ok: false, code: "MCP_TIMEOUT" });
    await conn.close();
  });

  it("classe une connexion morte en MCP_CRASHED", async () => {
    const { client } = await inMemoryFactory();
    const conn = McpConnection.fromClient(client);
    await conn.close();
    const out = await conn.call("get_user", {});
    expect(out).toMatchObject({ ok: false, code: "MCP_CRASHED" });
  });
});
