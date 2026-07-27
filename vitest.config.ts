import { defineConfig } from 'vitest/config';

// Tests unitaires de la logique pure (géométrie de mesure, accrochage, statuts).
// Environnement Node : ces modules n'ont aucune dépendance DOM.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    reporters: 'default',
  },
});
