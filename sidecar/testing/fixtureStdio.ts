// Usage : tsx sidecar/testing/fixtureStdio.ts <mode>
// modes : healthy | crash-after-connect | crash-once | slow-exit
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const mode = process.argv[2] ?? "healthy";
const { server } = await import("./fakeServer.js").then((m) => m.buildFakeRaindropServer());
const transport = new StdioServerTransport();
await server.connect(transport);
if (mode === "crash-after-connect") {
  setTimeout(() => process.exit(1), 200);
}
if (mode === "crash-once") {
  // Premier spawn : écrit le marqueur puis exit(1) après 200 ms.
  // Spawns ultérieurs (via FIXTURE_STATE_DIR) : voit le marqueur et reste stable.
  const marker = join(process.env.FIXTURE_STATE_DIR ?? ".", "crashed.flag");
  if (!existsSync(marker)) {
    writeFileSync(marker, "");
    setTimeout(() => process.exit(1), 200);
  }
}
if (mode === "slow-exit") {
  // reste vivant jusqu'au SIGTERM du test
}
