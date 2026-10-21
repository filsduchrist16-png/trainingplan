import { expect, test } from '@playwright/test';
import { makeFit } from '../../src/data/import/fixtures';

test('créer un plan 10 km depuis zéro avec l’assistant', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page.getByRole('heading', { name: "C'est quoi ton objectif?" })).toBeVisible();
  await page.getByRole('radio', { name: /^10 km/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click(); // course (date par défaut)
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: /Régulier/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('textbox', { name: 'Volume par semaine' }).fill('25');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: 'Un temps' }).click();
  await page.getByRole('textbox', { name: /Ton temps récent/ }).fill('50:00');
  await expect(page.getByText(/Tes allures/)).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Ton plan' })).toBeVisible();
  await expect(page.getByText('Ta première semaine')).toBeVisible();
  await page.getByRole('button', { name: 'Créer mon plan' }).click();

  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Plan' }).click();
  await page.getByRole('radio', { name: 'Bloc' }).click();
  await expect(page.getByText(/S1 · /)).toBeVisible();
});

test('« Nuit courte » en 2 taps allège la séance avec une explication', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorer avec des données de démo' }).click();
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('radio', { name: /En forme/ }).click();
  await page.getByRole('button', { name: /Nuit courte/ }).click();
  await expect(page.getByText('ajustée')).toBeVisible();
  await page.getByText('Pourquoi?').first().click();
  await expect(page.getByText(/Nuit courte/).first()).toBeVisible();
});

test('importer un FIT → debrief avec temps par zone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorer avec des données de démo' }).click();
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Plus' }).click();
  await page.getByRole('link', { name: /Importer des activités/ }).click();
  const fit = Buffer.from(makeFit({ minutes: 45, start: new Date() }));
  await page.locator('input[type=file]').setInputFiles({ name: 'sortie.fit', mimeType: 'application/octet-stream', buffer: fit });
  await expect(page.getByText(/1 activité importée/)).toBeVisible();
  await page.getByRole('button', { name: 'Voir le debrief' }).click();
  await expect(page.getByText('Temps par zone (tes zones)')).toBeVisible();
  await expect(page.getByText('Debrief', { exact: true })).toBeVisible();
});

test('déclarer une douleur tibiale change immédiatement le plan', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorer avec des données de démo' }).click();
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Corps' }).click();
  await page.getByRole('button', { name: 'tibia droit' }).click();
  await page.getByRole('slider', { name: 'Intensité' }).fill('4');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('STOP course').first()).toBeVisible();
  await page.getByRole('link', { name: "Aujourd'hui" }).click();
  await expect(page.getByText('STOP course').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Vélo Z2/ })).toBeVisible();
});

test('profil : zones manuelles et FC max', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorer avec des données de démo' }).click();
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Plus' }).click();
  await page.getByRole('link', { name: /^Profil/ }).click();
  await expect(page.getByRole('heading', { name: 'Profil' })).toBeVisible();
  await expect(page.getByText('123–143 bpm')).toBeVisible();
  await page.getByRole('radio', { name: 'Manuelles' }).click();
  const z2 = page.getByRole('spinbutton', { name: 'Z2 endurance : limite haute' });
  await z2.fill('140');
  await z2.blur();
  await expect(page.getByRole('spinbutton', { name: 'Z2 endurance : limite haute' })).toHaveValue('140');
  await page.getByRole('radio', { name: 'Automatiques' }).click();
  await expect(page.getByText('123–143 bpm')).toBeVisible();
});

test('l’assistant décide de la marche-course selon ce que tu cours d’une traite', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /^5 km/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: /Je n'ai jamais couru/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Moins de 5 min' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('On commence en marche-course')).toBeVisible();
  await expect(page.getByText(/1 min 30 course/).first()).toBeVisible(); // < 5 min d'affilée → palier 4
});
