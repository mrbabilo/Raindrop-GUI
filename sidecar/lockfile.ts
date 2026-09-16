import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Ruling R15 : le lockfile NE porte PAS le token local. Le token ne doit
// jamais figer en clair sur disque (spec §3.7, qui prime sur §3.6) ; Tauri
// connaît le token qu'il a généré — le lockfile n'a pas à le porter.
export interface LockfileData {
  port: number;
  pid: number;
  startedAt: string;
}

const fileName = "sidecar.json";

export function lockfilePath(dataDir: string): string {
  return join(dataDir, fileName);
}

export async function readLockfile(dataDir: string): Promise<LockfileData | null> {
  try {
    const raw = await readFile(lockfilePath(dataDir), "utf8");
    const d = JSON.parse(raw) as LockfileData;
    if (typeof d.port === "number" && typeof d.pid === "number") return d;
    return null;
  } catch {
    return null;
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function writeLockfile(
  dataDir: string,
  data: { port: number; pid?: number },
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  // pid injectable (seam de test — simuler un pid mort) ; prod : process.pid
  const payload: LockfileData = {
    ...data,
    pid: data.pid ?? process.pid,
    startedAt: new Date().toISOString(),
  };
  await writeFile(lockfilePath(dataDir), JSON.stringify(payload, null, 2), "utf8");
}

/**
 * "reused" = un sidecar vivant existe déjà (le caller sort proprement :
 * Tauri réutilisera l'instance active via le lockfile). Sinon écrit/écrase.
 */
export async function acquireLock(
  dataDir: string,
  data: { port: number },
): Promise<"created" | "reused"> {
  const existing = await readLockfile(dataDir);
  if (existing && isPidAlive(existing.pid)) return "reused";
  await writeLockfile(dataDir, data);
  return "created";
}

export async function clearLockfile(dataDir: string): Promise<void> {
  await unlink(lockfilePath(dataDir)).catch(() => undefined);
}
