# Calculateur de rentabilité de craft — Dofus 3

> **Projet en construction** (Phase 1 : pipeline de données terminé, interface à venir).
> Voir [SPEC.md](SPEC.md) pour la vision complète et [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md)
> pour l'étude des sources de données.

Site statique de calcul de rentabilité de craft pour Dofus 3 : choisir un objet,
renseigner le prix des ressources, obtenir le coût de craft, le seuil de
rentabilité et le verdict rentable / à perte.

## Données

- `data/` est généré automatiquement par `npm run ingest` (jamais édité à la main) :
  17 041 objets, 4 847 recettes avec métier, régénérables à tout moment.
- Un workflow GitHub Actions ([update-data](.github/workflows/update-data.yml)) tourne
  chaque semaine et ouvre une Pull Request si le jeu a été mis à jour.

## Développement

```bash
npm install
npm run ingest      # régénère data/ depuis les APIs
npm run check       # vérification TypeScript
```

## Mentions

Projet **non officiel**, non affilié à Ankama. Dofus est une marque d'Ankama Games.

- Données d'objets, recettes et images : [DofusDude](https://docs.dofusdu.de) (`api.dofusdu.de`)
- Métiers des recettes : Data sourced from [DofusDB](https://dofusdb.fr) (`api.dofusdb.fr`)
