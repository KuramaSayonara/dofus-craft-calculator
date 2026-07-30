import { cpSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// data/ n'est pas dans public/ (c'est un artefact d'ingestion committé) :
// on le copie dans dist/ au build ; en dev, Vite sert déjà les fichiers du projet.
function copyGameData(): Plugin {
  return {
    name: 'copy-game-data',
    apply: 'build',
    closeBundle() {
      cpSync(resolve(import.meta.dirname, 'data'), resolve(import.meta.dirname, 'dist/data'), {
        recursive: true,
      });
    },
  };
}

export default defineConfig({
  // base relative : fonctionne servi depuis n'importe quel sous-chemin GitHub Pages
  base: './',
  plugins: [react(), tailwindcss(), copyGameData()],
});
