// Compare deux versions du dossier data/ et imprime un résumé en Markdown
// (utilisé comme description de la Pull Request de mise à jour).
//
// Usage : tsx scripts/diff-data.ts <ancienDossier> <nouveauDossier>

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  type ItemRecord,
  type RecipeRecord,
  itemRecordSchema,
  metaSchema,
  recipesFileSchema,
} from './schema.ts';

const [oldDir, newDir] = process.argv.slice(2);
if (oldDir === undefined || newDir === undefined) {
  console.error('usage : tsx scripts/diff-data.ts <ancienDossier> <nouveauDossier>');
  process.exit(1);
}

function loadItems(dir: string): Map<number, ItemRecord> | null {
  const path = join(dir, 'items.json');
  if (!existsSync(path)) return null;
  const records = z.array(itemRecordSchema).parse(JSON.parse(readFileSync(path, 'utf8')));
  return new Map(records.map(record => [record.id, record]));
}

function loadRecipes(dir: string): Map<string, RecipeRecord> | null {
  const path = join(dir, 'recipes.json');
  if (!existsSync(path)) return null;
  const file = recipesFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  return new Map(Object.entries(file.recipes));
}

function loadVersion(dir: string): string | null {
  const path = join(dir, 'meta.json');
  if (!existsSync(path)) return null;
  return metaSchema.parse(JSON.parse(readFileSync(path, 'utf8'))).gameVersion;
}

function diffKeys<K, V>(before: Map<K, V>, after: Map<K, V>): { added: K[]; removed: K[]; changed: K[] } {
  const added: K[] = [];
  const removed: K[] = [];
  const changed: K[] = [];
  for (const key of after.keys()) {
    if (!before.has(key)) added.push(key);
    else if (JSON.stringify(before.get(key)) !== JSON.stringify(after.get(key))) changed.push(key);
  }
  for (const key of before.keys()) {
    if (!after.has(key)) removed.push(key);
  }
  return { added, removed, changed };
}

const newItems = loadItems(newDir);
const newRecipes = loadRecipes(newDir);
if (newItems === null || newRecipes === null) {
  console.error(`données absentes dans ${newDir}`);
  process.exit(1);
}

const oldItems = loadItems(oldDir);
const oldRecipes = loadRecipes(oldDir);
const oldVersion = loadVersion(oldDir);
const newVersion = loadVersion(newDir);

console.log('## Mise à jour automatique des données du jeu');
console.log('');
if (oldItems === null || oldRecipes === null) {
  console.log(`Premier jeu de données : ${newItems.size} objets, ${newRecipes.size} recettes (Dofus ${newVersion ?? '?'}).`);
  process.exit(0);
}

if (oldVersion !== newVersion) {
  console.log(`**Version du jeu : ${oldVersion ?? '?'} → ${newVersion ?? '?'}**`);
} else {
  console.log(`Version du jeu inchangée (${newVersion ?? '?'}).`);
}
console.log('');

const items = diffKeys(oldItems, newItems);
const recipes = diffKeys(oldRecipes, newRecipes);

console.log('| | Objets | Recettes |');
console.log('|---|---:|---:|');
console.log(`| Ajoutés | ${items.added.length} | ${recipes.added.length} |`);
console.log(`| Modifiés | ${items.changed.length} | ${recipes.changed.length} |`);
console.log(`| Supprimés | ${items.removed.length} | ${recipes.removed.length} |`);
console.log('');

const LIST_LIMIT = 30;
function listItems(title: string, ids: number[], source: Map<number, ItemRecord>): void {
  if (ids.length === 0) return;
  console.log(`### ${title} (${ids.length})`);
  for (const id of ids.slice(0, LIST_LIMIT)) {
    const item = source.get(id);
    console.log(item !== undefined ? `- ${item.name} (niv. ${item.level}, ${item.category}, id ${id})` : `- id ${id}`);
  }
  if (ids.length > LIST_LIMIT) console.log(`- … et ${ids.length - LIST_LIMIT} de plus`);
  console.log('');
}

listItems('Objets ajoutés', items.added, newItems);
listItems('Objets supprimés', items.removed, oldItems);

function listRecipes(title: string, keys: string[]): void {
  if (keys.length === 0) return;
  console.log(`### ${title} (${keys.length})`);
  for (const key of keys.slice(0, LIST_LIMIT)) {
    const id = Number(key);
    const item = newItems!.get(id) ?? oldItems!.get(id);
    console.log(item !== undefined ? `- ${item.name} (id ${id})` : `- id ${id}`);
  }
  if (keys.length > LIST_LIMIT) console.log(`- … et ${keys.length - LIST_LIMIT} de plus`);
  console.log('');
}

listRecipes('Recettes ajoutées', recipes.added);
listRecipes('Recettes modifiées', recipes.changed);
listRecipes('Recettes supprimées', recipes.removed);

console.log('---');
console.log('_Générée automatiquement par le workflow `update-data` (`scripts/ingest.ts`)._');
