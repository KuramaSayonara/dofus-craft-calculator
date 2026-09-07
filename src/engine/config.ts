// Constantes de configuration du moteur — chaque valeur métier n'existe qu'ici.

/** Taux de taxe de l'hôtel de vente appliqué au prix de vente (2 %). */
export const DEFAULT_TAX_RATE = 0.02;

/** Profondeur maximale d'expansion du craft récursif. */
export const DEFAULT_MAX_DEPTH = 8;

/** Marge (%) en dessous de laquelle un craft rentable est jugé « marginal ». */
export const DEFAULT_MARGINAL_THRESHOLD_PCT = 10;

// --- Brisage -----------------------------------------------------------------
// Ankama ne publie pas la formule : ces trois constantes viennent de la
// communauté (voir SPEC-BRISAGE.md). Elles ne vivent qu'ici pour qu'un
// calibrage sur des brisages réels n'ait qu'un seul endroit à corriger.

/** Facteur de niveau : le niveau de l'objet pèse dans le poids de chaque ligne. */
export const BRISAGE_LEVEL_FACTOR = 0.015;

/** Bonus fixe ajouté au poids de chaque ligne brisée. */
export const BRISAGE_LINE_BONUS = 1;

/** Part du poids des autres lignes reversée à la ligne focalisée (50 %). */
export const BRISAGE_FOCUS_OTHER_RATIO = 0.5;

/** Coefficient de brisage neutre, en % — jamais utilisé comme une vraie valeur. */
export const DEFAULT_COEFFICIENT = 100;

/** Bornes du coefficient affichées par le jeu. */
export const MIN_COEFFICIENT = 1;
export const MAX_COEFFICIENT = 4000;
