type Rang = "interactif" | "fond";

interface Tache {
  rang: Rang;
  lancer(): void;
}

/**
 * File séquentielle avec espacement minimum entre DÉBUTS d'appels.
 * 120 req/min autorisées par Raindrop → 550 ms ≈ 109 req/min (marge).
 * Le 429 HTTP est indétectable via MCP (aplati en "Error: ..." par le
 * package) : la protection est préventive, pas réactive (contrainte plan).
 *
 * DEUX RANGS (spec sauvegarde §4.4) : la limite étant globale par
 * utilisateur, la sauvegarde partage cette file au lieu d'appeler `fetch`
 * à côté. L'interactif passe devant — sinon un job de 2 min 20 rendrait
 * l'interface poussive tout du long.
 *
 * AVEC UN PLANCHER : une sur `PLANCHER_FOND` va au fond même si des
 * interactives attendent. Sans lui, « ce qui reste » peut ne jamais venir,
 * et le balayage hebdomadaire n'aboutirait jamais sur une application
 * utilisée sans interruption.
 *
 * SÉRIALISATION STRICTE (corrigée par rapport au brief) : le canal MCP est
 * un sous-processus stdio à protocole séquentiel — une seule tâche à la
 * fois, jamais deux en vol. `servirSuivant()` n'est donc appelé QUE depuis
 * le `.finally()` de la tâche qui vient de se terminer (plus l'amorce
 * initiale dans `run()`), jamais juste après le `lancer()` d'une tâche : la
 * file espace les DÉBUTS d'au moins `minIntervalMs` ET attend la FIN de
 * chacune avant de servir la suivante.
 */
/**
 * Ce qu'un appelant attend d'une file : soumettre un travail, à un rang.
 *
 * Déclarée ICI, chez qui l'implémente, plutôt que recopiée chez chaque
 * consommateur — elle l'était **trois fois** à l'identique (`lecture.ts`,
 * `archives.ts`, `archivage.ts`). `Throttle` la satisfait structurellement :
 * les modules de sauvegarde dépendent du contrat, pas de la classe.
 */
export interface File {
  run<T>(fn: () => Promise<T>, opts?: { rang?: Rang }): Promise<T>;
}

export class Throttle {
  private readonly attente: Record<Rang, Tache[]> = { interactif: [], fond: [] };
  private enMarche = false;
  private lastStart = 0;
  private _pending = 0;
  /** Depuis combien de services consécutifs le fond n'a-t-il rien eu. */
  private jeuneDuFond = 0;

  /** Une requête de fond servie au moins toutes les quatre. */
  static readonly PLANCHER_FOND = 4;

  constructor(public readonly minIntervalMs: number) {}

  get pendingCount(): number {
    return this._pending;
  }

  run<T>(fn: () => Promise<T>, opts?: { rang?: Rang }): Promise<T> {
    this._pending++;
    const rang = opts?.rang ?? "interactif";
    return new Promise<T>((resoudre, rejeter) => {
      this.attente[rang].push({
        rang,
        lancer: () => {
          // `fn` peut lever de façon SYNCHRONE (pas seulement rejeter une
          // promesse) : sans ce filet, l'exception s'échappe avant
          // `.then`/`.finally`, `enMarche` reste bloqué à `true` pour
          // toujours et la file entière — MCP et REST confondus — s'arrête
          // de servir qui que ce soit.
          let resultat: Promise<T>;
          try {
            resultat = fn();
          } catch (e) {
            resultat = Promise.reject(e);
          }
          resultat
            .then(resoudre, rejeter)
            .finally(() => {
              this._pending--;
              this.enMarche = false;
              this.servirSuivant();
            });
        },
      });
      this.servirSuivant();
    });
  }

  /** Qui passe : le fond si le plancher l'exige, l'interactif sinon. */
  private choisir(): Tache | undefined {
    const fondDu = this.jeuneDuFond >= Throttle.PLANCHER_FOND - 1;
    const ordre: Rang[] = fondDu ? ["fond", "interactif"] : ["interactif", "fond"];
    for (const r of ordre) {
      const t = this.attente[r].shift();
      if (t) {
        this.jeuneDuFond = t.rang === "fond" ? 0 : this.jeuneDuFond + 1;
        return t;
      }
    }
    return undefined;
  }

  private servirSuivant(): void {
    if (this.enMarche) return;
    const tache = this.choisir();
    if (!tache) return;
    this.enMarche = true;
    const attendre = Math.max(0, this.lastStart + this.minIntervalMs - Date.now());
    const partir = () => {
      this.lastStart = Date.now();
      // `enMarche` reste true jusqu'à la fin RÉELLE de la tâche (voir le
      // `.finally()` dans `run()`) : la tâche suivante n'est jamais servie
      // avant que celle-ci se termine, seulement une fois `minIntervalMs`
      // écoulé depuis son début.
      tache.lancer();
    };
    if (attendre > 0) setTimeout(partir, attendre);
    else partir();
  }
}
