// Adaptateur entre le format du fichier data/recipes.json (schéma d'ingestion)
// et les types du moteur. Import de type uniquement : aucune dépendance
// d'exécution du moteur vers Zod ou le pipeline de données.

import type { RecipesFile } from '../../scripts/schema.ts';
import type { RecipeGraph, RecipeInfo } from './types.ts';

export function graphFromRecipesFile(file: RecipesFile): RecipeGraph {
  const graph = new Map<number, RecipeInfo>();
  for (const [key, record] of Object.entries(file.recipes)) {
    graph.set(Number(key), {
      ingredients: record.ing,
      jobId: record.j,
      level: record.lv,
    });
  }
  return graph;
}
