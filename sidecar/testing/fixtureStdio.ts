// Usage : tsx sidecar/testing/fixtureStdio.ts <mode>
// modes : healthy | crash-after-connect | slow-exit
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const mode = process.argv[2] ?? "healthy";
const { server } = await import("./fakeServer.js").then((m) => m.buildFakeRaindropServer());
const transport = new StdioServerTransport();
await server.connect(transport);
if (mode === "crash-after-connect") {
  setTimeout(() => process.exit(1), 200);
}
if (mode === "slow-exit") {
  // reste vivant jusqu'au SIGTERM du test
}
