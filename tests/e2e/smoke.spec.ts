import { expect, test } from '@playwright/test';

test('premier lancement → démo → accueil vivant → backup → effacer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sentier' })).toBeVisible();
  await expect(page.getByText('aucune donnée de santé', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Explorer avec des données de démo' }).click();
  await expect(page.getByRole('heading', { name: /Salut Nicolas/ })).toBeVisible();
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await expect(page.getByText(/Semaine 27\/27/)).toBeVisible();
  await expect(page.getByText('Prochaine course A')).toBeVisible();

  await page.getByRole('link', { name: 'Plus' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exporter un backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/^sentier-backup-\d{4}-\d{2}-\d{2}\.json$/);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Effacer les données de démo' }).click();
  await page.getByRole('link', { name: "Aujourd'hui" }).click();
  await expect(page.getByRole('button', { name: 'Commencer' })).toBeVisible();
});
