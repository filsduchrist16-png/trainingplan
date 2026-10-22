import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Audit d'accessibilité (axe, WCAG 2 A et AA) des écrans principaux, thème sombre et clair. Zéro violation grave ou critique. */
const SCREENS: [string, string][] = [
  ['Aujourd\'hui', '/'], ['Plan', '/plan'], ['Progrès', '/progres'], ['Corps', '/corps'], ['Plus', '/plus'], ['Profil', '/profil'], ['Équipement', '/equipement'],
  ['Nutrition', '/nutrition'], ['Muscu', '/muscu'], ['Santé', '/sante'], ['Importer', '/importer'], ['Nouvel objectif', '/objectif'], ['Design', '/design'], ['Connexion', '/connexion'],
];

async function violations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}) : ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

for (const theme of ['dark', 'light'] as const) {
  test(`accessibilité (axe) — thème ${theme}`, async ({ page }) => {
    // Le thème est une préférence locale : on la fixe avant le chargement.
    await page.addInitScript((t) => localStorage.setItem('sentier.theme', t), theme);
    await page.goto('/');
    await page.getByRole('button', { name: 'Explorer avec des données de démo' }).click();
    await expect(page.getByText('Séance du jour')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const found: string[] = [];
    for (const [name, path] of SCREENS) {
      if (path !== '/') {
        // Navigation interne : un rechargement pendant l'écriture de la démo est fragile.
        await page.evaluate(`history.pushState({}, '', ${JSON.stringify(path)}); dispatchEvent(new PopStateEvent('popstate'))`);
        await page.waitForTimeout(500);
      }
      for (const v of await violations(page)) found.push(`[${name}] ${v}`);
    }
    expect(found).toEqual([]);
  });
}

test('accessibilité (axe) — feuille de log rapide, assistant (santé) et détail de séance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorer avec des données de démo' }).click();
  await expect(page.getByText('Séance du jour')).toBeVisible();
  const found: string[] = [];
  await page.getByRole('button', { name: "C'est fait" }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible();
  await page.waitForTimeout(400);
  for (const v of await violations(page)) found.push(`[Log rapide] ${v}`);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Détails' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(400);
  for (const v of await violations(page)) found.push(`[Détail de séance] ${v}`);
  expect(found).toEqual([]);
});

test('accessibilité (axe) — assistant, étape santé', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /^10 km/ }).click();
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Ta santé' })).toBeVisible();
  await page.getByRole('radiogroup', { name: /Es-tu enceinte/ }).getByRole('radio', { name: 'Oui' }).click();
  await page.getByRole('radio', { name: "J'ai accouché" }).click();
  await page.waitForTimeout(400);
  expect(await violations(page)).toEqual([]);
});
