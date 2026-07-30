# Phase 0 — Évaluation des sources de données

> Rapport établi le 30 juillet 2026, à partir de requêtes réellement exécutées contre les trois APIs
> (scripts de sondage Node : téléchargement complet des catégories DofusDude, pagination complète
> des 4 858 recettes DofusDB, croisement des deux jeux de données par `ankama_id`).

## Résumé exécutif

| | DofusDude | DofusDB | Dofapi |
|---|---|---|---|
| État | ✅ En ligne, à jour | ✅ En ligne, à jour | ❌ **Mort** (le domaine ne répond plus) |
| Version du jeu exposée | ✅ `3.6.8.8` + horodatage | ✅ `3.6.8.8` | — |
| Objets craftables | **4 847** | **4 858** (dont 11 non échangeables) | — |
| Métier / niveau de craft | ❌ **Absent** | ✅ Complet (métier, niveau, emplacements) | — |
| Facilité d'ingestion | ✅ 6 requêtes, ~17 Mo | ⚠️ ~100 requêtes paginées, très verbeux | — |

**Recommandation : DofusDude comme source principale, enrichie par DofusDB uniquement pour
l'information métier.** Jointure par `ankama_id` (= `resultId` chez DofusDB), vérifiée sur les
4 847 objets : correspondance à 100 %. Détail en fin de rapport.

---

## 1. DofusDude (`https://api.dofusdu.de`)

### Couverture réelle mesurée (jeu `dofus3`, langue `fr`)

Endpoints appelés : `/dofus3/v1/fr/items/{catégorie}/all` et `/dofus3/v1/fr/mounts/all`.
La catégorie s'appelle bien `quest` (pas `quest_items`, qui renvoie 404 — mais le type de
recherche s'appelle `items-quest_items` dans `/dofus3/v1/meta/search/types`).

| Catégorie | Objets | Avec recette | Poids JSON |
|---|---:|---:|---:|
| `equipment` | 4 356 | 3 363 | 8,6 Mo |
| `resources` | 3 639 | 869 | 1,9 Mo |
| `consumables` | 3 278 | 378 | 2,4 Mo |
| `quest` | 3 358 | 231 | 1,5 Mo |
| `cosmetics` | 2 410 | 6 | 2,1 Mo |
| `mounts` | 308 | 0 | 0,3 Mo |
| **Total** | **17 041** (ids tous uniques) | **4 847** | **~16,7 Mo** |

### Qualité des données

* **Recettes** : champ `recipe` = liste de `{item_ankama_id, item_subtype, quantity}`, exactement
  comme attendu. Les `item_subtype` rencontrés dans l'ensemble des recettes sont uniquement
  `resources` (23 961 occurrences), `equipment` (266) et `consumables` (257) → l'univers des
  ingrédients est entièrement couvert par 3 catégories.
* **Intégrité référentielle : parfaite.** Chaque `item_ankama_id` référencé par une recette existe
  dans le dataset téléchargé (0 ingrédient orphelin sur ~24 500 lignes de recette). Aucun id en
  double entre catégories.
* **Recettes intermédiaires : présentes.** 593 objets craftables sont eux-mêmes utilisés comme
  ingrédients (3 822 lignes de recette pointent vers un ingrédient craftable) → le craft récursif
  (planches, alliages, étoffes, etc.) est bien couvert.
* **Images** : `image_urls.icon` (64 px) et `.sd` (128 px) hébergées par l'API — utilisables
  directement, pas besoin de les stocker.
* **Champs disponibles** : `ankama_id`, `name`, `level`, `type`, `description`, `effects`,
  `recipe`, `image_urls`, `parent_set`, `pods`, conditions… Tout ce qu'il faut pour l'index de
  recherche.

### Le manque : le métier

**Aucune information de métier n'est exposée** : ni nom du métier, ni niveau requis, ni nombre
d'emplacements — ni dans `/all`, ni sur la fiche unitaire d'un objet. C'est le seul champ de la
spec (filtre « métier » de la recherche et du tableau de bord) que DofusDude ne peut pas fournir.

### Fraîcheur

* `/dofus3/v1/meta/version` → `{"version": "3.6.8.8", "update_stamp": "2026-07-29T09:59..."}` :
  données régénérées **hier**. C'est aussi l'endpoint idéal pour que le workflow GitHub Actions
  détecte une mise à jour du jeu.
* Le contenu le plus récent est présent : les équipements aux ids les plus hauts (« Dorsale de
  Willorque », « Lancepince d'Exécrabe », niv. 200, ids 34 328–34 332) correspondent exactement
  aux recettes les plus récentes de DofusDB. Les deux sources annoncent la même version du jeu.

### Conditions d'utilisation

* Pas de clé API. Aucune limite de débit documentée ni observée dans les en-têtes HTTP
  (le sondage complet — ~17 Mo, une douzaine de requêtes espacées — est passé sans erreur).
  L'ingestion gardera quand même un délai entre requêtes par politesse.
* Infrastructure open source (serveur `doduapi` en GPL-3.0, spéc. OpenAPI en MIT). Les données de
  jeu restent la propriété d'Ankama — d'où le disclaimer « non officiel, non affilié » prévu au README.
* La doc interactive (`docs.dofusdu.de`) est une application JavaScript : je n'ai pas pu y lire de
  conditions d'usage supplémentaires par requête simple. Rien d'autre trouvé dans les READMEs GitHub.

---

## 2. DofusDB (`https://api.dofusdb.fr`)

### Couverture réelle mesurée

* `/recipes` : **4 858 recettes** (toutes paginées et téléchargées lors du sondage).
* `/items` : 21 738 objets. `/jobs` : 23 métiers.
* `/version` → `3.6.8.8` (identique à DofusDude, données du jour).

### Ce que DofusDB a et que DofusDude n'a pas

Chaque recette expose `jobId` (+ objet `job` complet avec nom en 5 langues), `resultLevel`
(niveau du craft), et l'objet résultat inclut `recipeSlots` (nombre d'emplacements) et
`hasRecipe`. Répartition mesurée des 4 858 recettes par métier :

| Métier | Recettes | | Métier | Recettes |
|---|---:|---|---|---:|
| Bijoutier | 735 | | Éleveur | 211 |
| Cordonnier | 720 | | Bricoleur | 179 |
| Tailleur | 714 | | Paysan | 82 |
| « Base » (sans métier) | 554 | | Pêcheur | 65 |
| Forgeron | 484 | | Chasseur | 48 |
| Façonneur | 439 | | Mineur | 42 |
| Sculpteur | 289 | | Bûcheron | 32 |
| Alchimiste | 264 | | | |

(« Base » = recettes réalisables sans métier : planches en kokoko, Métarias, etc. — vérifié par
échantillonnage. Bien pertinentes pour le marché, à afficher comme « Sans métier ».)

### Inconvénients comme source principale

* **Verbosité extrême** : une seule recette « peuplée » pèse ~40 Ko (elle embarque l'objet résultat
  complet, tous ses effets, tous les ingrédients complets…). Heureusement `$select` permet de ne
  demander que des champs précis — c'est ce que fera l'ingestion.
* **Pagination plafonnée à 50 résultats/page** côté serveur : un dump complet des recettes = ~98
  requêtes, un dump complet des items ≈ 435 requêtes. Faisable, mais 40× plus de requêtes que
  DofusDude pour le même contenu. Aucune erreur ni limite de débit rencontrée pendant le sondage
  (~100 requêtes espacées de 250 ms).
* **Licence** : le site n'affiche que « © DofusDB — certaines illustrations propriété d'Ankama »,
  sans page de conditions lisible programmatiquement. La contrainte connue (usage non commercial,
  attribution « Data sourced from DofusDB ») sera respectée : projet gratuit, open source, et
  attribution dans le README + le pied de page du site.

---

## 3. Dofapi (`https://fr.dofus.dofapi.fr`)

**Écarté.** Le domaine ne répond plus du tout (échec réseau/DNS sur toutes les tentatives, avec
nouvelles tentatives espacées). Le projet était de toute façon orienté données anciennes.

---

## 4. Croisement des deux sources — la question des « 100 % »

Jointure des 4 847 craftables DofusDude avec les 4 858 recettes DofusDB par
`ankama_id` = `resultId` :

* **Recettes présentes chez DofusDude et absentes de DofusDB : 0.**
* **Recettes présentes chez DofusDB et absentes de DofusDude : 11** — et les 11 objets sont
  carrément absents du catalogue DofusDude. Vérification une par une : ce sont toutes des
  recettes de **quête** (type « Quêtes principales », non affiché dans l'encyclopédie), et les
  objets sont **non échangeables entre joueurs** (`exchangeable: false`) : Semelles de Vent,
  Cire draconique, Mèche draconique, Slip en laine, Alliage abyssal, Poudre de superlinpainpain,
  Omelette du Mage Ax, Encre d'ancrage, Gâteau Royal, Rune d'harmonie, +1 autre du même type.

**Conclusion : pour un calculateur de rentabilité à l'hôtel de vente, DofusDude couvre 100 % des
crafts pertinents.** Les 11 manquants ne peuvent ni s'acheter ni se vendre — ils n'ont pas de
rentabilité. Je propose de les ignorer (en le documentant) plutôt que de les fusionner ; si tu
veux l'exhaustivité absolue « encyclopédique », la fusion est possible via `resultId`, mais elle
ajouterait des objets sans prix possible.

---

## 5. Recommandation

### Source principale : DofusDude

1. **Couverture complète** des crafts liés au marché (démontré ci-dessus, pas supposé).
2. **Format taillé pour l'ingestion** : 6 requêtes, ~17 Mo, schéma propre et stable
   (`ankama_id`, `recipe`, `image_urls`), ids parfaitement cohérents entre catégories.
3. **Détection de mise à jour intégrée** : `meta/version` + `update_stamp` = exactement ce qu'il
   faut au cron GitHub Actions (comparer la version, ne PR que si elle change ou si le diff est
   non vide). Données régénérées côté DofusDude après chaque patch (constaté : dataset d'hier).
4. Pas de clé, pas de quota connu, infra open source.

### Complément ciblé : DofusDB, uniquement pour le métier

L'ingestion fera **en plus** ~98 petites requêtes `/recipes?$select[]=resultId&$select[]=jobId&$select[]=resultLevel`
(+ 1 requête `/jobs`) pour poser `métier` + `niveau de craft` sur chaque recette DofusDude.
Jointure sûre (100 % de correspondance vérifiée). Si DofusDB devenait indisponible, le site
fonctionnerait toujours — seul le filtre « métier » serait dégradé, et l'ingestion le signalerait
sans casser le build.

### Attribution prévue au README et en pied de page

* « Projet non officiel, non affilié à Ankama. Dofus est une marque d'Ankama. »
* « Données d'objets et images : DofusDude (api.dofusdu.de). »
* « Métiers des recettes : Data sourced from DofusDB (dofusdb.fr). »

---

## 6. Points ouverts soumis à validation

1. **Les 11 crafts de quête non échangeables** : ignorés (recommandé) ou inclus avec un badge
   « objet de quête, non échangeable » ?
2. **Les 231 recettes de la catégorie `quest` DofusDude** (objets de quête *échangeables* ou non,
   selon les cas) : je propose de les inclure, avec leur catégorie visible.
3. La contrainte non commerciale de DofusDB est sans impact ici (site gratuit), mais elle
   interdirait une monétisation future du site tant qu'on utilise leur enrichissement métier —
   à garder en tête.
