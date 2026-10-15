// À lancer après npm run build:sidecar. Données synthétiques dans tmpdir.
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeSmartListStore } from '../../../dist-sidecar/sidecar/smartlists/store.js';
import { AnalysisCache } from '../../../dist-sidecar/sidecar/analysis/cache.js';
const root = await mkdtemp(join(tmpdir(), 'rg-audit-'));
try {
  const dir = join(root, 'absent');
  const file = join(dir, 'smartlists.json');
  const store = makeSmartListStore({ file });
  try { await store.add({ label: 'échec', vue: { collectionId: 0 } }); }
  catch (e) { console.log('Premier ajout refusé :', e.code); }
  console.log('Mémoire après refus :', (await store.list()).map(x => x.label));
  await mkdir(dir);
  await store.add({ label: 'succès', vue: { collectionId: 0 } });
  console.log('Disque après ajout suivant :', JSON.parse(await readFile(file, 'utf8')).smartlists.map(x => x.label));
  const cache = await AnalysisCache.load(join(root, 'analysis.json'));
  const results = await Promise.allSettled([cache.save(), cache.save()]);
  console.log('Écritures concurrentes du cache :', results.map(r =>
    r.status === 'rejected' ? { status: r.status, code: r.reason.code } : { status: r.status }));
} finally {
  await rm(root, { recursive: true, force: true });
}
