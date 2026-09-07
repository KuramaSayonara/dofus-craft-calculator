// Table des runes de forgemagie : le pont entre une ligne de statistique d'un
// équipement et la rune que son brisage produit.
//
// Trois informations par rune, qui n'existent QUE dans ce fichier :
//
//   weight (poids unitaire) — combien « pèse » 1 point de la statistique.
//     Valeurs communautaires (Ankama ne publie pas la table) ; croisées entre
//     dofus-portals.fr, le calculateur KamelAkar/Calculateur_Brisage_Dofus et
//     dofocus.fr, qui donnent les mêmes chiffres.
//
//   grant (jet donné par UNE rune) — lu dans les données du jeu (diceNum de
//     l'effet porté par la rune elle-même) : une Rune Vi donne +5 Vitalité,
//     une Rune Pod +10 Pods, une Rune Ini +10 Initiative, toutes les autres +1.
//     Le poids d'une rune vaut donc weight × grant, et c'est par ce produit
//     qu'on divise le poids d'une ligne pour obtenir un nombre de runes.
//
//   dude / db — le même effet porte deux identifiants selon la source :
//     `dude` sur les équipements côté DofusDude, `db` sur la rune côté DofusDB.
//     Les deux sont conservés : `dude` sert à lire les objets, `db` sert au
//     garde-fou qui revérifie la correspondance à chaque ingestion.
//
// Piège vérifié dans les données : « Rune Ré Feu » donne de la résistance Feu
// FIXE, « Rune Ré Per Feu » donne du % de résistance Feu (Per = pourcentage).
// Les tables communautaires les intervertissent souvent.

export interface RuneDef {
  /** clé courte et stable, utilisée dans data/brisage.json */
  readonly key: string;
  /** libellé de la statistique, tel qu'affiché sur l'objet */
  readonly label: string;
  /** nom de la rune en jeu */
  readonly rune: string;
  /** poids d'UN point de la statistique */
  readonly weight: number;
  /** points de statistique donnés par UNE rune */
  readonly grant: number;
  /** id de type d'effet côté DofusDude (lecture des équipements) */
  readonly dude: number;
  /** id d'effet côté DofusDB (porté par la rune : sert de vérification) */
  readonly db: number;
  /** id d'objet de la rune de base — celle que le brisage produit */
  readonly basic: number;
  /** rune Pa (3 runes de base au Concasseur), null si elle n'existe pas */
  readonly pa: number | null;
  /** rune Ra (3 runes Pa), null si elle n'existe pas */
  readonly ra: number | null;
}

export const RUNES: readonly RuneDef[] = [
  // caractéristiques principales
  { key: 'vi', label: 'Vitalité', rune: 'Rune Vi', weight: 0.2, grant: 5, dude: 9, db: 125, basic: 1523, pa: 1548, ra: 1554 },
  { key: 'sa', label: 'Sagesse', rune: 'Rune Sa', weight: 3, grant: 1, dude: 10, db: 124, basic: 1521, pa: 1546, ra: 1552 },
  { key: 'fo', label: 'Force', rune: 'Rune Fo', weight: 1, grant: 1, dude: 45, db: 118, basic: 1519, pa: 1545, ra: 1551 },
  { key: 'ine', label: 'Intelligence', rune: 'Rune Ine', weight: 1, grant: 1, dude: 13, db: 126, basic: 1522, pa: 1547, ra: 1553 },
  { key: 'cha', label: 'Chance', rune: 'Rune Cha', weight: 1, grant: 1, dude: 22, db: 123, basic: 1525, pa: 1550, ra: 1556 },
  { key: 'age', label: 'Agilité', rune: 'Rune Age', weight: 1, grant: 1, dude: 36, db: 119, basic: 1524, pa: 1549, ra: 1555 },
  { key: 'pui', label: 'Puissance', rune: 'Rune Pui', weight: 2, grant: 1, dude: 32, db: 138, basic: 7436, pa: 10618, ra: 10619 },

  // secondaires
  { key: 'cri', label: '% Critique', rune: 'Rune Cri', weight: 10, grant: 1, dude: 29, db: 115, basic: 7433, pa: null, ra: null },
  { key: 'prospe', label: 'Prospection', rune: 'Rune Prospe', weight: 3, grant: 1, dude: 25, db: 176, basic: 7451, pa: 10662, ra: null },
  { key: 'ini', label: 'Initiative', rune: 'Rune Ini', weight: 0.1, grant: 10, dude: 24, db: 174, basic: 7448, pa: 7449, ra: 7450 },
  { key: 'pod', label: 'Pods', rune: 'Rune Pod', weight: 0.25, grant: 10, dude: 220, db: 158, basic: 7443, pa: 7444, ra: 7445 },
  { key: 'so', label: 'Soins', rune: 'Rune So', weight: 10, grant: 1, dude: 121, db: 178, basic: 7434, pa: 19337, ra: null },
  { key: 'invo', label: 'Invocation', rune: 'Rune Invo', weight: 30, grant: 1, dude: 28, db: 182, basic: 7442, pa: null, ra: null },

  // PA / PM / PO — seules les runes Ga existent
  { key: 'gapa', label: 'PA', rune: 'Rune Ga Pa', weight: 100, grant: 1, dude: 12, db: 111, basic: 1557, pa: null, ra: null },
  { key: 'gapme', label: 'PM', rune: 'Rune Ga Pme', weight: 90, grant: 1, dude: 8, db: 128, basic: 1558, pa: null, ra: null },
  { key: 'po', label: 'Portée', rune: 'Rune Po', weight: 51, grant: 1, dude: 31, db: 117, basic: 7438, pa: null, ra: null },

  // dommages
  { key: 'do', label: 'Dommages', rune: 'Rune Do', weight: 20, grant: 1, dude: 30, db: 112, basic: 7435, pa: null, ra: null },
  { key: 'doterre', label: 'Dommages Terre', rune: 'Rune Do Terre', weight: 5, grant: 1, dude: 48, db: 422, basic: 11657, pa: 11658, ra: null },
  { key: 'dofeu', label: 'Dommages Feu', rune: 'Rune Do Feu', weight: 5, grant: 1, dude: 61, db: 424, basic: 11659, pa: 11660, ra: null },
  { key: 'doeau', label: 'Dommages Eau', rune: 'Rune Do Eau', weight: 5, grant: 1, dude: 27, db: 426, basic: 11661, pa: 11662, ra: null },
  { key: 'doair', label: 'Dommages Air', rune: 'Rune Do Air', weight: 5, grant: 1, dude: 47, db: 428, basic: 11663, pa: 11664, ra: null },
  { key: 'doneutre', label: 'Dommages Neutre', rune: 'Rune Do Neutre', weight: 5, grant: 1, dude: 49, db: 430, basic: 11665, pa: 11666, ra: null },
  { key: 'docri', label: 'Dommages Critiques', rune: 'Rune Do Cri', weight: 5, grant: 1, dude: 38, db: 418, basic: 11653, pa: 11654, ra: null },
  { key: 'dopou', label: 'Dommages Poussée', rune: 'Rune Do Pou', weight: 5, grant: 1, dude: 62, db: 414, basic: 11649, pa: 11650, ra: 29684 },
  { key: 'doren', label: 'Dommages Renvoyés', rune: 'Rune Do Ren', weight: 10, grant: 1, dude: 249, db: 220, basic: 7437, pa: 30942, ra: null },
  { key: 'dopi', label: 'Dommages Pièges', rune: 'Rune Do Pi', weight: 5, grant: 1, dude: 112, db: 225, basic: 7446, pa: 10613, ra: null },
  { key: 'perpi', label: 'Puissance Pièges', rune: 'Rune Per Pi', weight: 2, grant: 1, dude: 106, db: 226, basic: 7447, pa: 10615, ra: 10616 },

  // résistances fixes (Rune Ré X)
  { key: 'reterre', label: 'Résistance Terre', rune: 'Rune Ré Terre', weight: 2, grant: 1, dude: 15, db: 240, basic: 7455, pa: null, ra: null },
  { key: 'refeu', label: 'Résistance Feu', rune: 'Rune Ré Feu', weight: 2, grant: 1, dude: 14, db: 243, basic: 7452, pa: null, ra: null },
  { key: 'reeau', label: 'Résistance Eau', rune: 'Rune Ré Eau', weight: 2, grant: 1, dude: 82, db: 241, basic: 7454, pa: null, ra: null },
  { key: 'reair', label: 'Résistance Air', rune: 'Rune Ré Air', weight: 2, grant: 1, dude: 60, db: 242, basic: 7453, pa: null, ra: null },
  { key: 'reneutre', label: 'Résistance Neutre', rune: 'Rune Ré Neutre', weight: 2, grant: 1, dude: 33, db: 244, basic: 7456, pa: null, ra: null },

  // résistances en pourcentage (Rune Ré Per X)
  { key: 'reperterre', label: '% Résistance Terre', rune: 'Rune Ré Per Terre', weight: 6, grant: 1, dude: 63, db: 210, basic: 7459, pa: 19342, ra: 30695 },
  { key: 'reperfeu', label: '% Résistance Feu', rune: 'Rune Ré Per Feu', weight: 6, grant: 1, dude: 37, db: 213, basic: 7457, pa: 19340, ra: 30697 },
  { key: 'repereau', label: '% Résistance Eau', rune: 'Rune Ré Per Eau', weight: 6, grant: 1, dude: 17, db: 211, basic: 7560, pa: 19339, ra: 30698 },
  { key: 'reperair', label: '% Résistance Air', rune: 'Rune Ré Per Air', weight: 6, grant: 1, dude: 16, db: 212, basic: 7458, pa: 19338, ra: 30700 },
  { key: 'reperneutre', label: '% Résistance Neutre', rune: 'Rune Ré Per Neutre', weight: 6, grant: 1, dude: 34, db: 214, basic: 7460, pa: 19341, ra: 30696 },
  { key: 'recri', label: 'Résistance Critiques', rune: 'Rune Ré Cri', weight: 2, grant: 1, dude: 46, db: 420, basic: 11655, pa: 11656, ra: 30699 },
  { key: 'repou', label: 'Résistance Poussée', rune: 'Rune Ré Pou', weight: 2, grant: 1, dude: 70, db: 416, basic: 11651, pa: 11652, ra: 29683 },

  // tacle, fuite, retraits et esquives
  { key: 'fui', label: 'Fuite', rune: 'Rune Fui', weight: 4, grant: 1, dude: 59, db: 752, basic: 11637, pa: 11638, ra: null },
  { key: 'tac', label: 'Tacle', rune: 'Rune Tac', weight: 4, grant: 1, dude: 26, db: 753, basic: 11639, pa: 11640, ra: null },
  { key: 'repa', label: 'Esquive PA', rune: 'Rune Ré Pa', weight: 7, grant: 1, dude: 75, db: 160, basic: 11641, pa: 11642, ra: null },
  { key: 'repme', label: 'Esquive PM', rune: 'Rune Ré Pme', weight: 7, grant: 1, dude: 39, db: 161, basic: 11643, pa: 11644, ra: null },
  { key: 'retpa', label: 'Retrait PA', rune: 'Rune Ret Pa', weight: 7, grant: 1, dude: 64, db: 410, basic: 11645, pa: 11646, ra: null },
  { key: 'retpme', label: 'Retrait PM', rune: 'Rune Ret Pme', weight: 7, grant: 1, dude: 50, db: 412, basic: 11647, pa: 11648, ra: null },

  // pourcentages de dommages et de résistances
  { key: 'dopermele', label: '% Dommages mêlée', rune: 'Rune Do Per Mé', weight: 15, grant: 1, dude: 40, db: 2800, basic: 18719, pa: null, ra: null },
  { key: 'doperdist', label: '% Dommages distance', rune: 'Rune Do Per Di', weight: 15, grant: 1, dude: 71, db: 2804, basic: 18720, pa: null, ra: null },
  { key: 'doperarme', label: "% Dommages d'armes", rune: 'Rune Do Per Ar', weight: 15, grant: 1, dude: 41, db: 2808, basic: 18721, pa: null, ra: null },
  { key: 'dopersort', label: '% Dommages aux sorts', rune: 'Rune Do Per So', weight: 15, grant: 1, dude: 93, db: 2812, basic: 18722, pa: null, ra: null },
  { key: 'repermele', label: '% Résistance mêlée', rune: 'Rune Ré Per Mé', weight: 15, grant: 1, dude: 65, db: 2803, basic: 18723, pa: null, ra: null },
  { key: 'reperdist', label: '% Résistance distance', rune: 'Rune Ré Per Di', weight: 15, grant: 1, dude: 108, db: 2807, basic: 18724, pa: null, ra: null },

  // arme de chasse : ligne sans valeur chiffrée (drapeau), comptée comme un jet de 1
  { key: 'chasse', label: 'Arme de chasse', rune: 'Rune de chasse', weight: 5, grant: 1, dude: 92, db: 795, basic: 10057, pa: null, ra: null },
];

/** Types d'objets réellement brisables en jeu. */
export const BREAKABLE_TYPES: ReadonlySet<string> = new Set([
  // équipements portés
  'Amulette', 'Anneau', 'Bottes', 'Cape', 'Ceinture', 'Chapeau', 'Bouclier',
  // armes et outils
  'Épée', 'Marteau', 'Bâton', 'Dague', 'Baguette', 'Arc', 'Hache', 'Pelle',
  'Lance', 'Faux', 'Pioche', 'Arme magique', 'Outil',
]);

/**
 * Effets présents sur les équipements qui ne donnent AUCUNE rune : leur absence
 * de la table est volontaire. Sert au garde-fou d'ingestion — tout autre effet
 * fréquent non mappé fait échouer le run, pour qu'une nouveauté Ankama ne passe
 * pas inaperçue. Identifiants DofusDude.
 */
export const IGNORED_EFFECT_IDS: ReadonlySet<number> = new Set([
  0, // « Échangeable : »
  35, // titre
  81, // lié au personnage
  83, // fabrication coopérative impossible
  84, // reçu le
  98, // attitude
  101, // « Quelqu'un vous suit ! »
  117, // change l'apparence
  119, // change les paroles
  123, // nombre de victimes
  145, // ajout d'un sort temporaire
  191, // « / »
  // modificateurs de sort portés par les objets (« Fracture : +2 Portée »…)
  204, 205, 206, 207, 208, 209, 226, 227, 231, 240, 243, 245, 251, 274,
  262, // Fertile
]);

/** Poids d'UNE rune : ce par quoi on divise le poids d'une ligne. */
export function runeWeight(rune: RuneDef): number {
  return rune.weight * rune.grant;
}
