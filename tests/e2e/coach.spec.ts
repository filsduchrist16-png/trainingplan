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
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Continuer' }).click();
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
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('On commence en marche-course')).toBeVisible();
  await expect(page.getByText(/1 min 30 course/).first()).toBeVisible(); // < 5 min d'affilée → palier 4
});

test('courir de zéro : durée calculée par défaut, avertissement si on la raccourcit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /Courir de zéro/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText(/le temps qu'il faut pour courir 30 min/)).toBeVisible();
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('À la fin : tu cours 30 min.')).toBeVisible();
  await expect(page.getByText(/Ton plan finira au palier/)).toHaveCount(0);
  // Retour à la durée : on choisit 6 semaines.
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: /Retour/ }).click();
  await page.getByRole('radio', { name: 'Je choisis' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Durée du plan : moins' }).click();
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText(/Ton plan finira au palier \d+ sur 13\./)).toBeVisible();
});

async function startFromZero(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /Courir de zéro/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Moins de 5 min' }).click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Créer mon plan' }).click();
  await expect(page.getByTestId('runwalk-stage')).toHaveText('Palier 4 sur 13');
}
async function logToday(page: import('@playwright/test').Page, rpe: number) {
  await page.getByRole('button', { name: "C'est fait" }).click();
  await expect(page.getByRole('button', { name: "J'ai fait tous les intervalles" })).toBeVisible();
  await page.getByRole('slider', { name: 'RPE' }).fill(String(rpe));
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeHidden();
}
async function goTo(page: import('@playwright/test').Page, iso: string) {
  await page.clock.setSystemTime(new Date(`${iso}T08:00:00`));
  await page.reload();
}

test('marche/course : 2 séances validées → la séance suivante passe au palier suivant', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-04-21T08:00:00') }); // mardi
  await startFromZero(page);
  await logToday(page, 4);
  await expect(page.getByText('Séance validée (1 sur 2)')).toBeVisible();
  await goTo(page, '2026-04-23');
  await logToday(page, 3);
  await goTo(page, '2026-04-25');
  await expect(page.getByTestId('runwalk-stage')).toHaveText('Palier 5 sur 13');
  await expect(page.getByText(/2 min course/).first()).toBeVisible();
});

test('marche/course : une séance à RPE 8 → palier répété', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-04-21T08:00:00') });
  await startFromZero(page);
  await logToday(page, 4);
  await goTo(page, '2026-04-23');
  await logToday(page, 8);
  await goTo(page, '2026-04-25');
  await expect(page.getByTestId('runwalk-stage')).toHaveText('Palier 4 sur 13');
  await expect(page.getByText(/1 min 30 course/).first()).toBeVisible();
});

test('questionnaire santé : un oui à la douleur thoracique demande un avis médical', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /^5 km/ }).click();
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Ta santé' })).toBeVisible();
  await page.getByRole('radiogroup', { name: /douleurs ou un serrement dans la poitrine/ }).getByRole('radio', { name: 'Oui' }).click();
  await expect(page.getByText('Un avis médical avant de commencer.')).toBeVisible();
  // Pas de plan sans avis médical.
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Un avis médical avant de commencer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer mon plan' })).toBeDisabled();
  // Un médecin autorise : plan prudent.
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: /Retour/ }).click();
  await page.getByRole('button', { name: "Un médecin m'autorise à courir" }).click();
  await expect(page.getByText('Autorisation médicale enregistrée.')).toBeVisible();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Plan prudent.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer mon plan' })).toBeEnabled();
});
