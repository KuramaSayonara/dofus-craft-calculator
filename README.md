# Calculateur de rentabilité de craft — Dofus 3

Site statique pour savoir si un craft est rentable : tu choisis un objet, tu renseignes le prix
des ressources, l'outil te donne le coût de revient, le **prix de vente minimum pour être à
l'équilibre** et un verdict rentable / marginal / à perte.

Deux partis pris qui le distinguent des outils existants :

- **100 % des objets craftables du jeu** — 4 847 recettes, aucune liste écrite à la main.
- **Données à jour automatiquement** — un robot vérifie chaque semaine si Ankama a mis le jeu à
  jour et propose les changements dans une Pull Request.

## Fonctionnalités

| | |
|---|---|
| **Recherche** | Insensible aux accents et à la casse (« epee boisaille » trouve « Épée de Boisaille »), filtres cumulables par type, niveau, métier ; navigable entièrement au clavier. |
| **Craft récursif** | Les ingrédients eux-mêmes craftables se déplient en arbre. Pour chacun : Acheter, Crafter, ou Automatique (le moins cher). Détection des cycles, profondeur limitée, prix manquants signalés — jamais traités comme zéro. |
| **Rentabilité** | Taxe de l'hôtel de vente paramétrable, seuil de rentabilité exact au kama, comparaison prix marché / ton prix, profit par craft et pour la quantité voulue. |
| **Carnet de prix** | Profils multi-serveurs, horodatage et pastilles de fraîcheur, saisie par lot ×1/×10/×100, import en masse `nom;prix`, export/import JSON. |
| **Stock possédé** | Saisie de ce qu'on a déjà en jeu : la liste de courses ne réclame que le complément, et deux coûts sont affichés (voir ci-dessous). |
| **Demande des quêtes** | Pour les 428 crafts réclamés par une quête : quelle quête, en quelle quantité, quelle catégorie et à quel niveau. Explique pourquoi un objet se vend par lot, avec un filtre de recherche dédié. |
| **Ventes observées** | Saisie facultative du nombre d'exemplaires vus vendus sur 24 h / 7 j / 30 j : en déduit un rythme d'écoulement, un délai pour vendre sa production et un profit par jour. |
| **Liste de courses** | Ressources de base agrégées après résolution de l'arbre, stock déduit, cases à cocher, export texte. |
| **Suivi** | Crafts sauvegardés en dossiers ; ventes en cours à coût figé ; historique avec profit réel, marge moyenne et classement. |
| **Top crafts** | Balayage de tous les crafts du jeu avec tes prix, trié par marge, plus les crafts « presque calculables » et le nombre de prix qui manquent. |

## Les prix ne sont pas fournis (et c'est volontaire)

Il n'existe aucune source publique et fiable des prix de l'hôtel de vente : ils dépendent du
serveur et changent en permanence. Le site n'invente donc **aucun** prix — un prix faux serait
pire que pas de prix. Tu saisis les tiens ; ils restent **sur ton appareil** (IndexedDB, avec
localStorage en repli) et ne sont envoyés nulle part.

## Deux coûts, et pourquoi

Quand on possède déjà une partie des ressources, l'outil affiche **deux chiffres différents**,
volontairement :

- **Coût de revient complet** — toutes les ressources comptées au prix du marché, y compris
  celles qu'on possède. C'est le juge honnête de la rentabilité : les ressources en stock
  auraient pu être revendues telles quelles, les utiliser a donc un coût réel.
- **Kamas à sortir** — uniquement ce qu'il reste à acheter. C'est la trésorerie : ce qui quitte
  vraiment la bourse maintenant.

Exemple réel. Potion de Souvenir (10 Sauge + 20 Ortie), Sauge à 101 K, Ortie à 146 K, vente à
2 706 K. Coût complet 3 930 K → perte de 1 278 K. Avec 1 000 Sauge déjà en stock, il ne reste
que 2 920 K à sortir… mais la vente ne rapporte que 2 652 K net : **encore 268 K de perte**.
Posséder la ressource ne rend pas un craft rentable, ça réduit seulement la mise de départ.

## Pourquoi certains crafts se vendent par lot

Beaucoup d'objets ne se vendent pas à l'unité : une quête en réclame un nombre précis, et les
joueurs achètent ce nombre d'un coup. C'est déroutant quand on débute. L'outil affiche donc,
pour chaque craft concerné, la ou les quêtes qui le demandent et la quantité exacte.

Exemple : le **Bâton de Boisaille** est réclamé **10 fois** par la quête « Du repos mais pas
trop... » (Alignement Bonta, niveau 51). Personne n'en achète un seul — d'où un bouton pour
calculer directement le coût et la marge d'un lot de 10.

Le filtre **« 📜 Demandé par une quête »** de la recherche permet de parcourir ces objets même
sans savoir lesquels chercher.

**Ce que l'outil ne sait pas** : le volume réellement échangé sur ton serveur. Aucune API
publique ne l'expose, et il n'a pas été inventé. La quantité affichée est celle que la quête
exige — c'est ce qui explique la taille des lots, pas la demande du jour. Pour la demande
réelle, la section « Ventes observées » permet de saisir soi-même ce qu'on constate à l'hôtel.

### D'où viennent ces données

Les besoins sont reconstruits depuis les **objectifs** de quête, pas depuis le champ `need`
agrégé au niveau de la quête : ce dernier est incomplet (la quête « Produits naturels » y
déclare 3 objets alors que ses objectifs en réclament 6).

Deux subtilités traitées :

- Pour un objectif de type « apporter N exemplaires », l'objet demandé est dans `parameters`,
  tandis que `need` contient sa **recette décomposée**. Utiliser `need` inventerait une demande
  sur des ingrédients que DofusDB ne relie pas à la quête. Cette interprétation a été validée
  sur 361 couples (objet, quête) confrontés à l'index inverse `questsThatUse` : 100 % de
  concordance, zéro contradiction.
- Les identifiants qui ne correspondent à aucun objet du catalogue (monstres, PNJ) sont écartés.

**Limite connue** : 25 crafts que `questsThatUse` relie à une quête restent absents, la base
se contredisant elle-même sur ces cas. La couverture est de 428 crafts.

## Lancer le projet

```bash
npm install
```

```bash
npm run dev
```

Autres commandes :

| Commande | Effet |
|---|---|
| `npm run build` | Construit le site dans `dist/` (données de jeu incluses). |
| `npm test` | Tests unitaires du moteur de calcul (Vitest). |
| `npm run check` | Vérification TypeScript stricte. |
| `npm run ingest` | Régénère `data/` depuis les APIs (voir ci-dessous). |

## Régénérer les données du jeu

```bash
npm run ingest
```

Le script télécharge tous les objets, valide chaque enregistrement, contrôle l'intégrité du
graphe de recettes, puis réécrit `data/`. Il est **idempotent** : relancé sans changement côté
API, il produit des fichiers identiques.

Il **échoue volontairement** (code de sortie ≠ 0) si le résultat est aberrant : catégorie vide,
ingrédient orphelin, ou dataset plus petit qu'au run précédent. Si une baisse est légitime
(retrait de contenu par Ankama), relancer avec `ALLOW_SHRINK=1`.

Fichiers produits — jamais édités à la main :

| Fichier | Contenu |
|---|---|
| `data/items.json` | Tous les objets (nom, niveau, type, catégorie, icône). |
| `data/recipes.json` | Recettes, métier et niveau de craft. |
| `data/quest-needs.json` | Quêtes qui réclament un objet, et en quelle quantité. |
| `data/search-index.json` | Index léger chargé en premier pour une recherche instantanée. |
| `data/meta.json` | Version du jeu et comptages (sert de garde-fou au run suivant). |

## Mise à jour automatique

Deux workflows GitHub Actions :

- **[`update-data`](.github/workflows/update-data.yml)** — chaque lundi matin (et à la demande) :
  relance l'ingestion et, si quelque chose a changé, **ouvre une Pull Request** avec un résumé
  lisible (objets ajoutés / modifiés / supprimés). Jamais de push direct sur `main`.
- **[`deploy`](.github/workflows/deploy.yml)** — à chaque push sur `main` : vérifie les types,
  lance les tests, construit le site et le publie sur GitHub Pages.

## Déployer

Le site est entièrement statique : pas de serveur, pas de base de données, pas de clé API.

1. Créer un dépôt GitHub et y pousser le projet :

```bash
git remote add origin https://github.com/<utilisateur>/<depot>.git
```

```bash
git push -u origin main
```

2. Dans les réglages du dépôt, section **Pages**, choisir **GitHub Actions** comme source.
3. Le workflow `deploy` publie le site à chaque push sur `main`.

Le site utilise des chemins relatifs : il fonctionne aussi bien à la racine d'un domaine que
sous un sous-chemin `https://<utilisateur>.github.io/<depot>/`.

## Architecture

```
scripts/ingest.ts     Ingestion hors navigateur (Node + Zod)
      ↓
data/*.json           Dataset committé dans le dépôt
      ↓
src/engine/           Moteur de calcul : TypeScript pur, sans React, testé
      ↓
src/app/              Interface React (aucun calcul métier dans les composants)
```

Le moteur (`src/engine/`) est constitué de fonctions sans effet de bord prenant en entrée le
graphe de recettes et le carnet de prix. Il est testé en priorité sur les cas piégeux : cycles
dans les recettes, imbrication profonde, prix inconnus, arbitrage acheter/crafter, arrondis en
kamas (arithmétique entière, aucune dérive de virgule flottante).

## Conventions de calcul

Deux règles ont été choisies faute de documentation officielle, et sont documentées ici parce
qu'elles peuvent produire un écart de 1 kama :

- **Taxe de l'hôtel de vente** : arrondie au kama **inférieur**.
- **Prix unitaire depuis un lot** (×10 / ×100) : arrondi au kama **supérieur**, pour ne jamais
  sous-estimer un coût de craft.

Le taux de taxe par défaut (2 %) et le seuil de marge « marginal » (10 %) sont modifiables dans
l'onglet Prix.

## Mentions légales et sources

Projet **non officiel**, **non affilié à Ankama**. Dofus est une marque déposée d'Ankama Games.
Les données et les illustrations du jeu appartiennent à Ankama.

- Objets, recettes et images : **[DofusDude](https://docs.dofusdu.de)** (`api.dofusdu.de`)
- Métiers des recettes : **Data sourced from [DofusDB](https://dofusdb.fr)** (`api.dofusdb.fr`) —
  usage non commercial

L'étude comparative des sources de données est dans
[`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md).
