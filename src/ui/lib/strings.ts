/**
 * Textes de l'interface (fr-CA). Centralisés pour une traduction future.
 * Ton : court, direct, un brin d'humour québécois léger. Jamais niaiseux ni culpabilisant.
 */
export const t = {
  app: { name: 'Sentier', tagline: 'Plans route et trail. Tes données restent sur ton appareil.' },
  nav: { today: "Aujourd'hui", plan: 'Plan', progress: 'Progrès', body: 'Corps', more: 'Plus' },
  privacy:
    "Tout reste sur ton appareil : aucune donnée de santé n'est envoyée nulle part. Fais un backup de temps en temps, c'est ton filet de sécurité.",
  disclaimer: "Sentier n'est pas un avis médical. Une douleur qui persiste, ça se fait voir par un pro.",
  empty: {
    plan: "Pas encore de plan. Choisis un objectif et on bâtit le reste ensemble.",
    progress: 'Les courbes apparaissent après quelques séances. Importe ton historique pour aller plus vite.',
  },
} as const;
