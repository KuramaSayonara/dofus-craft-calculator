# SPEC — Calculateur de rentabilité de craft Dofus 3

## Contexte

Site web de calcul de rentabilité de craft pour Dofus 3 (économie du jeu / hôtel de vente). Le principe : je choisis un objet craftable, je renseigne le prix des ressources, et le site me dit si le craft est rentable et à quel prix minimum le vendre.

Un site existant fait déjà ça : `https://tenmalexis.github.io/Calculateur-Craft-Dofus/`. Même concept, mais sans copier son design ni son code.

Ses deux défauts majeurs, qui sont les deux exigences principales :

1. Les données ne sont pas à jour → le site doit se mettre à jour automatiquement à chaque mise à jour du jeu, sans intervention manuelle.
2. Il manque énormément d'items → le site doit contenir 100 % des objets craftables du jeu, sans aucune liste d'items écrite à la main.

Ces deux points sont plus importants que n'importe quelle fonctionnalité cosmétique. Toute solution qui implique de maintenir une liste d'items manuellement est rejetée d'office.

## Phase 0 — Recherche avant tout code (obligatoire)

Ne pas commencer à coder. Explorer les sources de données disponibles et écrire un rapport dans `docs/DATA-SOURCES.md`.

Sources à évaluer (par ordre de préférence a priori, à vérifier) :

* **DofusDude** — `https://api.dofusdu.de`, doc OpenAPI : `https://docs.dofusdu.de` et le YAML sur `github.com/dofusdude/api-docs`. Pas de clé API. Endpoints du type `/{game}/v1/{language}/items/{category}/all` avec `game=dofus3`, `language=fr`, et des catégories comme `equipment`, `resources`, `consumables`, `quest_items`, `cosmetics`, `mounts`. Le champ `recipe` (liste de `{item_ankama_id, item_subtype, quantity}`) est le plus intéressant, ainsi que les `image_urls`. Vérifier aussi s'il existe un endpoint de version du jeu (utile pour détecter une mise à jour Dofus).
* **DofusDB** — `https://api.dofusdb.fr` (API type Feathers, filtres en query string). Attention : licence non commerciale avec attribution obligatoire (« Data sourced from DofusDB »). À utiliser en source de secours ou de recoupement, et à mentionner dans le README si utilisée.
* **Dofapi** — `https://fr.dofus.dofapi.fr`. Probablement obsolète / orienté Dofus Touch. À vérifier, sans doute à écarter.

Pour chaque source, tester réellement les requêtes et rapporter :

* Le nombre total d'objets avec recette obtenus, par catégorie.
* Si les métiers / professions sont exposés (nom du métier, niveau requis du craft, nombre d'emplacements de recette).
* Si les recettes intermédiaires sont là (une ressource elle-même craftable : runes, poudres, etc.).
* La fraîcheur des données (est-ce que le contenu ajouté le plus récemment est présent ?).
* Le poids total du dataset et les limites de débit (rate limits).
* Les conditions d'utilisation / licence.

Puis proposer une recommandation argumentée et attendre validation avant la Phase 1. Si aucune source ne couvre 100 % des crafts, le dire clairement plutôt que de faire semblant, et proposer une stratégie de complétion (fusion de deux sources avec l'`ankama_id` comme clé).

## Architecture imposée

Site 100 % statique, déployable sur GitHub Pages, sans backend, sans clé API, sans base de données.

La fraîcheur des données ne doit PAS venir d'appels API en direct dans le navigateur (trop lent, dépendant de la dispo de l'API, et impossible de faire de la recherche performante sur ~20 000 objets). Le schéma attendu est :

```
scripts/ingest.ts          ← script Node exécuté hors du navigateur
     ↓ (télécharge TOUTES les catégories, normalise, valide)
data/items.json  data/recipes.json  data/search-index.json
     ↓ (committé dans le repo)
app statique      ← charge des fichiers JSON locaux, ultra rapide
```

Et pour la mise à jour automatique :

* Un workflow GitHub Actions (`.github/workflows/update-data.yml`) qui tourne en cron (hebdomadaire) et en `workflow_dispatch` manuel : il relance `ingest`, compare avec les données existantes, et ouvre une Pull Request (pas un push direct sur `main`) s'il y a des différences, avec un résumé lisible dans la description : X objets ajoutés, Y recettes modifiées, Z supprimés.
* Un second workflow de build + déploiement sur GitHub Pages.
* Le script d'ingestion doit être idempotent, gérer les erreurs réseau avec retry + backoff, respecter un délai entre requêtes, et échouer bruyamment (exit code ≠ 0) si le résultat est aberrant (ex. moins d'objets qu'au run précédent, ou une catégorie vide) — pas de PR qui vide les données silencieusement.

Stack : Vite + React + TypeScript (strict) + Tailwind. Pas de framework serveur. Le routing doit fonctionner sous un sous-chemin GitHub Pages (`/nom-du-repo/`).

Performance : le dataset complet ne doit pas être chargé d'un bloc au premier rendu. Séparer un index de recherche léger (id, nom, niveau, type, icône, `hasRecipe`) des détails de recette chargés à la demande. Objectif : recherche instantanée (< 50 ms de frappe à l'affichage) et premier affichage utile en moins de 2 s sur mobile.

## Le problème des prix (important)

Il n'existe aucune API publique et fiable des prix de l'hôtel de vente : les prix sont propres à chaque serveur et changent en permanence. Ne pas inventer de source de prix, ne rien scraper, et ne pas inventer de prix « par défaut » plausibles — un prix faux est pire que pas de prix.

Le prix est donc une donnée saisie par l'utilisateur, et le carnet de prix personnel doit être traité comme un vrai actif :

* Saisie du prix unitaire par ressource, en kamas, avec support des suffixes `k` et `m` (`350k`, `1.2m`) et affichage formaté.
* Persistance locale (IndexedDB, avec localStorage en repli), aucune donnée envoyée nulle part.
* Profils multi-serveurs : les prix d'un serveur ne sont pas ceux d'un autre ; on doit pouvoir basculer de profil sans perdre ses données.
* Horodatage de chaque prix + indicateur visuel de fraîcheur (ex. neutre < 3 jours, à surveiller < 7 jours, périmé au-delà) et un écran « prix à rafraîchir » listant les ressources périmées les plus utilisées.
* Saisie par lot : dans le jeu on achète en x1 / x10 / x100 ; permettre de saisir le prix du lot et de laisser le site calculer l'unitaire.
* Export / import JSON complet du carnet de prix (sauvegarde et transfert entre machines), et un import en masse depuis une liste collée (`nom;prix` par ligne) avec rapport des lignes non reconnues.

## Fonctionnalités

### 1. Recherche d'objet

Recherche sur tout le jeu : fuzzy, insensible à la casse et aux accents (« epee dus » doit trouver « Épée du Dus »), avec filtres cumulables par type d'objet, niveau (plage), métier, et un filtre « craftable uniquement ». Affichage : icône, nom, type, niveau. Navigation clavier complète (flèches, Entrée, Échap).

### 2. Fiche de craft

Pour l'objet sélectionné : les ingrédients avec icône, quantité, prix unitaire saisissable, sous-total, et le coût total du craft. Multiplicateur de quantité (« je veux en crafter 20 ») qui recalcule tout, y compris la liste de courses.

### 3. Craft récursif (la fonctionnalité qui doit faire la différence)

Beaucoup d'ingrédients sont eux-mêmes craftables. Pour chaque ingrédient craftable, l'utilisateur doit pouvoir choisir : Acheter, Crafter, ou Automatique (le moins cher des deux). Affichage sous forme d'arbre dépliable avec le coût de chaque branche, et l'indication de l'économie réalisée en craftant plutôt qu'en achetant.

Contraintes de robustesse : détection des cycles dans le graphe de recettes (A nécessite B qui nécessite A → ne jamais boucler à l'infini), profondeur maximale configurable, mémoïsation des coûts, et gestion propre du cas « prix inconnu » (le coût devient partiellement indéterminé et doit être signalé comme tel, pas traité comme 0).

### 4. Calculs de rentabilité

* Taxe HDV appliquée au prix de vente, taux paramétrable (valeur par défaut 2 %, une seule constante de configuration).
* Deux prix de vente comparés côte à côte : le prix marché constaté et le prix de vente envisagé.
* Sorties : coût de craft, montant net après taxe, profit absolu, marge en %, et surtout le prix de vente minimum pour être à l'équilibre (seuil de rentabilité) — c'est l'information la plus utile.
* Verdict visuel clair (rentable / marginal / à perte) avec un seuil de marge configurable, plus le profit par craft et le profit total pour la quantité demandée.

### 5. Liste de courses

Agrégation de toutes les ressources de base nécessaires (après résolution de l'arbre récursif) pour N crafts : quantité totale, coût total, cases à cocher pour suivre les achats en cours, et export en texte copiable.

### 6. Sauvegardes et suivi

* Sauvegarde d'un craft configuré, organisation en dossiers, tri par date / nom / rentabilité, recherche dans les sauvegardes.
* Ventes en cours : quand un objet est mis en vente, le coût de craft est figé au moment de la mise en vente (l'historique ne doit pas être réécrit par une variation de prix ultérieure).
* Historique des ventes : date, item, prix de vente, coût figé, profit réel, commentaire. Avec des agrégats : profit total, marge moyenne, et un classement des items les plus rentables dans les faits.
* Export / import JSON de l'ensemble.

### 7. Tableau de bord « top crafts »

À partir des prix déjà renseignés, un tableau balayant tous les crafts dont toutes les ressources ont un prix connu, trié par marge, avec filtres par métier et niveau, et l'indication du nombre de prix manquants pour les crafts presque calculables.

## Qualité de code exigée

* Le moteur de calcul est du TypeScript pur, isolé de React (`src/engine/`) : fonctions sans effet de bord prenant en entrée le graphe de recettes + le carnet de prix. Zéro calcul métier dans les composants.
* Tests unitaires (Vitest) sur le moteur, en particulier : cycle dans les recettes, profondeur imbriquée, prix manquant, arbitrage acheter/crafter, application de la taxe, calcul du seuil de rentabilité, arrondis en kamas (pas de flottants qui dérivent). Le moteur doit être testé avant l'UI.
* Aucun `any` implicite ou explicite non justifié. Types dérivés du schéma d'ingestion, validés à l'exécution côté script d'ingestion (Zod ou équivalent).
* Accessible et utilisable au clavier ; responsive mobile en priorité.
* Mode sombre par défaut, mais pas de temps perdu sur le design avant que la logique soit complète et testée.
* Commits atomiques et lisibles à chaque étape.
* `README.md` expliquant comment lancer, comment régénérer les données, comment déployer, et mentionnant clairement que le projet est non officiel, non affilié à Ankama, avec l'attribution de la source de données utilisée.

## Plan de travail attendu

Travailler par phases, avec une pause à la fin de chaque phase pour montrer le résultat avant de continuer :

* **Phase 0** — Rapport `docs/DATA-SOURCES.md` + recommandation. (attendre validation)
* **Phase 1** — Script d'ingestion + dataset complet généré + validation de schéma + workflow GitHub Actions de mise à jour par PR. Livrer les chiffres réels : combien d'objets craftables au total, par métier.
* **Phase 2** — Moteur de calcul + suite de tests qui passe. Pas d'UI.
* **Phase 3** — UI minimale : recherche, fiche de craft, saisie des prix, résultats de rentabilité.
* **Phase 4** — Craft récursif avec arbre et arbitrage acheter/crafter.
* **Phase 5** — Persistance, profils serveurs, sauvegardes, ventes en cours, historique, export/import.
* **Phase 6** — Tableau de bord top crafts, liste de courses, filtres avancés.
* **Phase 7** — Déploiement GitHub Pages, finition visuelle, README.

## Deux règles de comportement

1. Si une information manque (endpoint incertain, champ absent de l'API, mécanique de jeu incertaine), vérifier ou demander — ne pas inventer de données de jeu ni de valeurs par défaut plausibles.
2. Si une exigence ci-dessus est une mauvaise idée technique, le dire avant de l'implémenter plutôt que de l'appliquer silencieusement.
