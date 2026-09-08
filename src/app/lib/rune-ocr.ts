// Lecture d'une capture d'écran de l'hôtel de vente : transforme le texte brut
// reconnu en prix de runes vérifiés.
//
// La reconnaissance de caractères se trompe (« Rune Ré Pou » lu « Rune Ré Pau »,
// un « 8 » lu « B »…). Deux garde-fous rendent le résultat fiable :
//
//   1. le nom est recalé sur le catalogue réel des runes du jeu ;
//   2. l'hôtel de vente affiche AUSSI le niveau de la rune — s'il ne correspond
//      pas à celui du catalogue, la ligne est marquée douteuse.
//
// Rien n'est appliqué sans relecture : ce module ne fait que proposer.

/** Une rune du catalogue du jeu. */
export interface RuneCatalogEntry {
  readonly id: number;
  readonly name: string;
  readonly level: number;
}

export type Confidence = 'sure' | 'probable' | 'douteux';

export interface ParsedRunePrice {
  readonly id: number;
  readonly name: string;
  readonly level: number;
  readonly price: number;
  /** niveau lu sur la capture (null si absent) */
  readonly readLevel: number | null;
  readonly confidence: Confidence;
  /** ce qui cloche, à afficher tel quel */
  readonly issue?: string;
  /** la ligne d'origine, pour que l'utilisateur puisse vérifier */
  readonly raw: string;
}

export interface RuneOcrResult {
  readonly rows: readonly ParsedRunePrice[];
  /** lignes non reconnues : l'utilisateur doit savoir ce qui a été laissé de côté */
  readonly ignored: readonly string[];
}

/** Sous-titre répété sous chaque nom dans l'hôtel de vente : jamais un nom de rune. */
const SUBTITLE = 'rune de forgemagie';

/** Minuscules, sans accents, ponctuation réduite à des espaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Distance d'édition, plafonnée : au-delà de `max`, inutile de compter plus loin. */
export function editDistance(a: string, b: string, max = 4): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      current.push(value);
      if (value < best) best = value;
    }
    if (best > max) return max + 1;
    previous = current;
  }
  return previous[b.length]!;
}

/** Les nombres d'une ligne, tels quels : « 30 394 » donne [30, 394]. */
export function readNumberTokens(line: string): number[] {
  return (line.match(/\d+/g) ?? []).map(Number);
}

/**
 * Recolle un prix écrit avec des espaces de milliers : [15, 886] vaut 15 886.
 * Un groupe de 3 chiffres qui suit un nombre lui appartient.
 */
export function joinThousands(tokens: readonly number[]): number {
  let value = 0;
  for (const token of tokens) {
    value = value === 0 ? token : value * 1000 + token;
  }
  return value;
}

interface Candidate {
  entry: RuneCatalogEntry;
  distance: number;
}

/** Meilleure rune du catalogue pour un morceau de texte, ou null. */
function bestMatch(text: string, catalog: readonly RuneCatalogEntry[]): Candidate | null {
  const normalized = normalize(text);
  if (normalized === '' || normalized === SUBTITLE) return null;

  // 1. le nom apparaît tel quel : on prend le plus long (« Rune Ré Per Terre »
  //    plutôt que « Rune Ré Terre » quand les deux collent)
  let exact: RuneCatalogEntry | null = null;
  for (const entry of catalog) {
    const name = normalize(entry.name);
    if (normalized.includes(name) && (exact === null || name.length > normalize(exact.name).length)) {
      exact = entry;
    }
  }
  if (exact !== null) return { entry: exact, distance: 0 };

  // 2. sinon, on tolère quelques caractères faux sur la partie « nom » de la
  //    ligne (les chiffres de niveau et de prix en sont retirés)
  const words = normalized.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
  if (words === '' || words === SUBTITLE) return null;

  let best: Candidate | null = null;
  for (const entry of catalog) {
    const name = normalize(entry.name);
    const tolerance = Math.max(1, Math.floor(name.length / 6));
    // on compare au début de la ligne, longueur du nom attendu
    const head = words.slice(0, name.length + tolerance);
    const distance = Math.min(editDistance(name, words, tolerance), editDistance(name, head, tolerance));
    if (distance <= tolerance && (best === null || distance < best.distance)) {
      best = { entry, distance };
    }
  }
  return best;
}

/**
 * Lit un texte reconnu sur une capture de l'hôtel de vente et en tire des prix.
 *
 * Une ligne utile porte un nom de rune et au moins un nombre. Quand le niveau
 * du jeu est reconnu parmi les nombres, il sert de preuve et le nombre restant
 * est le prix ; sinon le plus grand nombre est retenu, et la ligne est marquée.
 */
export function parseRunePrices(text: string, catalog: readonly RuneCatalogEntry[]): RuneOcrResult {
  const rows: ParsedRunePrice[] = [];
  const ignored: string[] = [];
  const seen = new Set<number>();

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== '');

  // Le nom et le prix ne tombent pas forcément sur la même ligne : dans
  // l'hôtel de vente, le nom est au-dessus du sous-titre « Rune de forgemagie »
  // et les colonnes Niveau / Prix moyen s'alignent sur l'un ou sur l'autre.
  // On regroupe donc chaque nom reconnu avec les nombres qui le suivent,
  // jusqu'au nom suivant.
  interface Block {
    match: Candidate;
    tokens: number[];
    raw: string[];
  }
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of lines) {
    const isSubtitle = normalize(line) === SUBTITLE;
    const match = isSubtitle ? null : bestMatch(line, catalog);
    const tokens = readNumberTokens(line);

    if (match !== null) {
      current = { match, tokens: [...tokens], raw: [line] };
      blocks.push(current);
      continue;
    }
    // Suite de la même rangée : le sous-titre, ou une ligne qui ne porte que
    // des nombres (les colonnes Niveau et Prix moyen). Une ligne qui contient
    // d'autres mots appartient à autre chose — l'avaler fausserait le prix.
    const words = normalize(line).replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
    const isContinuation = isSubtitle || words === '' || words === SUBTITLE;
    if (current !== null && isContinuation && tokens.length > 0) {
      current.tokens.push(...tokens);
      current.raw.push(line);
      continue;
    }
    if (current !== null && isContinuation) {
      current.raw.push(line);
      continue;
    }
    // ni un nom, ni la suite d'une rangée : on le signale s'il portait un chiffre
    if (tokens.length > 0) ignored.push(line);
  }

  for (const block of blocks) {
    const line = block.raw.join(' ');
    const tokens = block.tokens;
    if (tokens.length === 0) {
      // nom sans aucun nombre : deviner serait pire que de le signaler
      ignored.push(line);
      continue;
    }
    const match = block.match;
    const entry = match.entry;

    // « 30 394 » se lit soit 30 394 kamas, soit niveau 30 puis prix 394. Seul
    // le niveau du catalogue tranche — l'hôtel de vente affiche toujours le
    // niveau avant le prix.
    const levelIndex = tokens.indexOf(entry.level);
    let readLevel: number | null;
    let priceTokens: number[];
    if (levelIndex !== -1) {
      readLevel = entry.level;
      priceTokens = tokens.filter((_, index) => index !== levelIndex);
    } else if (tokens.length >= 2) {
      readLevel = tokens[0]!;
      priceTokens = tokens.slice(1);
    } else {
      readLevel = null;
      priceTokens = tokens;
    }
    const price = joinThousands(priceTokens);

    let confidence: Confidence;
    let issue: string | undefined;
    if (levelIndex !== -1 && match.distance === 0) {
      confidence = 'sure';
    } else if (levelIndex !== -1) {
      confidence = 'probable';
      issue = 'nom reconnu approximativement';
    } else if (match.distance === 0) {
      confidence = 'probable';
      issue = `niveau ${entry.level} attendu, ${readLevel === null ? 'aucun' : readLevel} lu`;
    } else {
      confidence = 'douteux';
      issue = 'nom et niveau incertains';
    }

    if (price <= 0) {
      ignored.push(line);
      continue;
    }
    if (seen.has(entry.id)) {
      // deux lignes pour la même rune : la seconde est probablement un doublon
      // de défilement, on garde la première et on signale
      ignored.push(line);
      continue;
    }
    seen.add(entry.id);

    rows.push({
      id: entry.id,
      name: entry.name,
      level: entry.level,
      price,
      readLevel,
      confidence,
      ...(issue !== undefined ? { issue } : {}),
      raw: line,
    });
  }

  return { rows, ignored };
}
