/** Version de l'app en cours d'exécution (injectée au build). */
export const BUILD = typeof __APP_BUILD__ === 'undefined' ? { version: 'dev', commit: 'local', date: '' } : __APP_BUILD__;

export function versionLabel(): string {
  const date = BUILD.date ? new Date(BUILD.date).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  return `Sentier v${BUILD.version} · ${BUILD.commit}${date ? ` · ${date}` : ''}`;
}
