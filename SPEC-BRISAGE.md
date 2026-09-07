# Spec — Module Brisage & XP métier

Extension du calculateur de craft (voir `SPEC.md`). Même dépôt, même site, même
déploiement : le brisage a besoin du coût de craft, et le coût de craft est déjà
calculé ici sur les 4 847 recettes réelles du jeu.

## 1. Le besoin

Monter un métier d'artisanat **et** gagner des kamas en brisant des objets.
Le site doit répondre à quatre questions, dans cet ordre d'importance :

1. **Est-ce rentable ?** Cet objet, crafté (ou acheté) puis brisé, rapporte-t-il
   plus que ce qu'il coûte ?
2. **Jusqu'où c'est rentable ?** À partir de quel prix d'achat / de quel coût de
   craft l'opération devient perdante — le prix plafond à ne pas dépasser.
3. **À partir de quel coefficient ?** Le taux de brisage bouge tout le temps sur
   le serveur : à partir de quelle valeur cet objet devient intéressant, et en
   dessous de laquelle il faut arrêter.
4. **Quoi briser / crafter en priorité ?** Un classement de tous les objets du
   jeu, et un parcours de leveling métier au coût net le plus bas.

## 2. Mécanique du jeu retenue

### 2.1 Formule du brisage

Pour chaque ligne de statistique d'un objet :

```
poids_ligne  = (jet × poids_rune × niveau_objet × 0,015) + 1
poids_ligne  = poids_ligne × (coefficient / 100)
nb_runes     = poids_ligne / poids_rune
```

La partie entière est le nombre de runes **garanties** ; la partie décimale est
la **probabilité** d'obtenir une rune de plus.

**Brisage focalisé** : le poids de la ligne focalisée compte à 100 %, celui de
toutes les autres lignes positives à 50 %, et le total est converti en runes de
la seule statistique focalisée.

```
total = poids_focus + 0,5 × Σ poids_autres_lignes
nb_runes_focus = total × (coefficient / 100) / poids_rune_focus
```

Sources concordantes (deux implémentations indépendantes + un guide) :
[dofus-portals](https://dofus-portals.fr/outils/calculateur-brisage/),
[Calculateur_Brisage_Dofus](https://github.com/KamelAkar/Calculateur_Brisage_Dofus),
[DoFocus](https://dofocus.fr/guide/), [Papycha](https://papycha.fr/taux-de-brisage/).

**Limite connue, à afficher dans le site** : Ankama ne publie pas la formule
exacte. Les constantes `0,015` et `+ 1` viennent de la communauté. Elles sont
regroupées dans un seul fichier de configuration et le site propose un mode
« calibrage » (§ 4.6) qui compare la prévision au résultat réel d'un brisage.

### 2.2 Coefficient (taux de brisage)

Depuis la 1.65 il n'est plus fixe : il évolue avec l'économie du serveur, entre
1 % et 4 000 %, et se lit dans l'interface de brisage du jeu. Le site ne
l'invente jamais : l'utilisateur le saisit. Il est stocké **par rune et par
profil de serveur**, avec une valeur par défaut globale.

### 2.3 Ce que le brisage rend

Uniquement des **runes de forgemagie de base** (« Rune Fo », « Rune Vi »…).
Les runes Pa et Ra s'obtiennent en fusionnant 3 runes du palier inférieur au
Concasseur ; les runes Ta / Pata / Rata (transcendance) ne viennent pas du
brisage et sont exclues.

Le site affiche donc la valeur en runes de base, et — si le prix des Pa/Ra est
connu — signale quand fusionner rapporte davantage.

### 2.4 Poids des runes

Table complète en un seul endroit (`scripts/runes.ts`), une entrée par
statistique : libellé, poids unitaire, identifiants d'effet DofusDude, et les
identifiants d'objet des runes de base / Pa / Ra.

Valeurs de référence : Vitalité 0,2 · Force / Intelligence / Chance / Agilité 1 ·
Puissance 2 · Sagesse et Prospection 3 · Initiative 0,1 · Pods 0,25 ·
% Critique et Soins 10 · Dommages 20 · Dommages élémentaires 5 ·
% Résistance élémentaire 6 · Résistance fixe 2 · Tacle / Fuite 4 ·
Retrait et Esquive PA/PM 7 · PA 100 · PM 90 · PO 51 · Invocation 30.

### 2.5 Objets brisables

Équipements portés (anneau, chapeau, bottes, ceinture, amulette, cape, bouclier)
et armes / outils. **Non brisables** : Dofus, trophées, prysmaradites, familiers,
montures, certificats, compagnons, équipements de percepteur.

Une ligne d'effet ne donne des runes que si son type figure dans la table §2.4.
Sont donc ignorés : les dégâts d'arme (lignes « actives »), les effets de sort,
et tout ce qui est purement descriptif. Une ligne au jet négatif ne rend rien.

### 2.6 Jets

Un objet crafté sort avec un jet aléatoire entre le minimum et le maximum de
chaque ligne. Le site calcule par défaut sur le **jet moyen**, et permet de
basculer sur jet minimum (pessimiste), maximum, ou une saisie exacte ligne par
ligne pour un objet déjà en inventaire.

## 3. Règles produit non négociables

- **Aucun prix inventé.** Prix des runes, des ressources et des objets : saisis
  par l'utilisateur, horodatés, par profil de serveur — comme le reste du site.
- **Aucun coefficient inventé.**
- **Deux lectures systématiques** : « garanti » (runes entières seulement) et
  « espérance » (avec les probabilités). Un seuil de rentabilité est donné pour
  chacun — le vrai résultat est entre les deux.
- La **taxe de l'hôtel de vente** s'applique à la revente des runes, avec la
  même convention d'arrondi que le reste du site.
- Tout ce qui est incertain est **affiché comme incertain**, jamais lissé.

## 4. Contenu du module

### 4.1 Fiche brisage d'un objet
Lignes de l'objet, coefficient, focus, mode de jet → runes obtenues, valeur
brute, valeur nette après taxe, comparée au coût de craft *et* au prix d'achat.

### 4.2 Les seuils (le cœur de la demande)
- **Prix d'achat plafond** : au-dessus, briser est perdant.
- **Coût de craft plafond** : idem côté craft.
- **Coefficient plancher** : en dessous, ne pas briser.
- **Tableau de sensibilité** prix × coefficient, pour voir d'un coup d'œil où
  bascule la rentabilité.
- **Meilleur focus** : quelle statistique focaliser rapporte le plus, comparée
  au brisage non focalisé.

### 4.3 Prix des runes
Écran dédié : saisie groupée par famille, import en masse, pastilles de
fraîcheur, et repérage des runes qui bloquent un calcul.

### 4.4 Classement « Top brisage »
Balayage de tous les objets brisables : profit par brisage, profit par kama
investi, filtres métier / niveau / type, section « presque calculable » quand il
ne manque qu'un ou deux prix.

### 4.5 Planificateur d'XP métier
Métier, niveau de départ, niveau visé → quoi crafter, en quelle quantité, coût
brut, valeur récupérée au brisage, **coût net réel** du leveling.

### 4.6 Journal de brisage et calibrage
Enregistrer un brisage réel (objet, coefficient, runes obtenues) pour comparer
au calcul, mesurer l'écart et corriger les constantes si besoin.

## 5. Données

Nouveau fichier `data/brisage.json`, produit par l'ingestion existante :
table des runes (poids, ids d'objet) + lignes brisables de chaque équipement
(min, max). Chargé seulement quand le module est ouvert.

Garde-fous d'ingestion : échec du run si une rune référencée n'existe plus, si
la couverture des objets brisables chute, ou si un type d'effet fréquent n'est
pas mappé (nouveauté Ankama à traiter).

## 6. Phases (validation utilisateur à la fin de chacune)

- **Phase 0** — table des runes + `data/brisage.json` + garde-fous + tests.
- **Phase 1** — moteur pur : runes obtenues, valeur, seuils, focus, tests.
- **Phase 2** — fiche brisage dans l'interface + les seuils (§ 4.1, 4.2).
- **Phase 3** — écran prix des runes (§ 4.3).
- **Phase 4** — classement Top brisage (§ 4.4).
- **Phase 5** — planificateur d'XP métier (§ 4.5).
- **Phase 6** — journal de brisage et calibrage (§ 4.6).
- **Phase 7** — finition mobile, documentation, mise en ligne.
