// Types d'entrée du moteur. Tous les montants sont des kamas ENTIERS :
// le moteur ne manipule jamais de fractions de kama.

/** Une recette : ingrédients (id, quantité), métier et niveau de craft. */
export interface RecipeInfo {
  readonly ingredients: ReadonlyArray<readonly [itemId: number, quantity: number]>;
  readonly jobId: number | null;
  readonly level: number | null;
}

/** Le graphe complet des recettes : id de l'objet résultat → recette. */
export type RecipeGraph = ReadonlyMap<number, RecipeInfo>;

/**
 * Le carnet de prix de l'utilisateur : id d'objet → prix unitaire connu.
 * Un objet absent de la carte a un prix INCONNU (jamais traité comme 0).
 */
export type PriceBook = ReadonlyMap<number, number>;
