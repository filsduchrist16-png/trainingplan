import { expect, test } from '@playwright/test';
import { makeFit } from '../../src/data/import/fixtures';

/** Avance dans l'assistant jusqu'à ce que `target` soit visible (les étapes sans objet sont sautées selon le profil). */
async function continueUntil(page: import('@playwright/test').Page, target: import('@playwright/test').Locator) {
  for (let i = 0; i < 12 && !(await target.isVisible()); i++) {
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.waitForTimeout(250);
  }
  await expect(target).toBeVisible();
}
/** La démo vit autour d'aujourd'hui : on fixe un mercredi pour que « la séance du jour » existe toujours. */
async function openDemo(page: import('@playwright/test').Page) {
  await page.clock.install({ time: new Date('2026-10-21T08:00:00') });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explorer avec des données de démo' }).click();
}
const planHeading = (page: import('@playwright/test').Page) => page.getByRole('heading', { name: 'Ton plan' });

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
  await continueUntil(page, planHeading(page));
  await expect(page.getByText('Ta première semaine')).toBeVisible();
  await page.getByRole('button', { name: 'Créer mon plan' }).click();

  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Plan' }).click();
  await page.getByRole('radio', { name: 'Bloc' }).click();
  await expect(page.getByText(/S1 · /)).toBeVisible();
});

test('« Nuit courte » en 2 taps allège la séance avec une explication', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('radio', { name: /En forme/ }).click();
  await page.getByRole('button', { name: /Nuit courte/ }).click();
  await expect(page.getByText('ajustée')).toBeVisible();
  await page.getByText('Pourquoi?').first().click();
  await expect(page.getByText(/Nuit courte/).first()).toBeVisible();
});

test('importer un FIT → debrief avec temps par zone', async ({ page }) => {
  await openDemo(page);
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
  await openDemo(page);
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Corps' }).click();
  await page.getByRole('button', { name: 'tibia droit', exact: true }).click();
  await page.getByRole('slider', { name: 'Intensité' }).fill('4');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('STOP course').first()).toBeVisible();
  await page.getByRole('link', { name: "Aujourd'hui" }).click();
  await expect(page.getByText('STOP course').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Vélo Z2/ })).toBeVisible();
});

test('profil : zones manuelles et FC max', async ({ page }) => {
  await openDemo(page);
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
  await continueUntil(page, planHeading(page));
  await expect(page.getByText('On commence en marche-course')).toBeVisible();
  await expect(page.getByText(/1 min 30 course/).first()).toBeVisible(); // < 5 min d'affilée → palier 4
});

test('courir de zéro : durée calculée par défaut, avertissement si on la raccourcit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /Courir de zéro/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText(/le temps qu'il faut pour courir 30 min/)).toBeVisible();
  await continueUntil(page, planHeading(page));
  await expect(page.getByText('À la fin : tu cours 30 min.')).toBeVisible();
  await expect(page.getByText(/Ton plan finira au palier/)).toHaveCount(0);
  // « Courir de zéro » : ni l'expérience ni un temps de référence ne sont demandés (6 étapes au lieu de 8).
  await expect(page.getByText('8 / 8')).toBeVisible();
  // Retour à la durée : on choisit 6 semaines.
  for (let i = 0; i < 12 && !(await page.getByRole('radio', { name: 'Je choisis' }).isVisible()); i++) {
    await page.getByRole('button', { name: /Retour/ }).click();
    await page.waitForTimeout(250);
  }
  await page.getByRole('radio', { name: 'Je choisis' }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Durée du plan : moins' }).click();
  await continueUntil(page, planHeading(page));
  await expect(page.getByText(/Ton plan finira au palier \d+ sur 13\./)).toBeVisible();
});

async function startFromZero(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /Courir de zéro/ }).click();
  await continueUntil(page, page.getByRole('button', { name: 'Moins de 5 min' }));
  await page.getByRole('button', { name: 'Moins de 5 min' }).click();
  await continueUntil(page, planHeading(page));
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

test('post-partum à 8 semaines : pas d’objectif de course, test de reprise proposé', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /^10 km/ }).click();
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radiogroup', { name: /Es-tu enceinte/ }).getByRole('radio', { name: 'Oui' }).click();
  await page.getByRole('radio', { name: "J'ai accouché" }).click();
  const birth = new Date(Date.now() - 56 * 864e5).toISOString().slice(0, 10);
  await page.getByLabel("Date de l'accouchement").fill(birth);
  await expect(page.getByRole('button', { name: 'Marcher 30 min' })).toBeVisible();
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('heading', { name: 'Pas encore d’objectif de course' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer mon plan' })).toBeDisabled();
});

test('« Je sais pas » chez un régulier : séance d’évaluation, puis plan ajusté au temps tenu', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-04-21T08:00:00') }); // mardi
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /^10 km/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: /Régulier/ }).click();
  await continueUntil(page, planHeading(page));
  await expect(page.getByText('Ta 1re séance : une évaluation.')).toBeVisible();
  await page.getByRole('button', { name: 'Créer mon plan' }).click();
  await expect(page.getByRole('heading', { name: /Évaluation : jusqu'à 10 min/ })).toBeVisible();
  await page.getByRole('button', { name: "C'est fait" }).click();
  await expect(page.getByRole('textbox', { name: "Minutes courues d'affilée" })).toHaveValue('10');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeHidden();
  // 10 min tenues : au-dessus du seuil d'un régulier, plus besoin de marche/course.
  await expect(page.getByTestId('runwalk-stage')).toBeHidden();
});

test('jamais couru, marathon : objectif irréaliste, objectif intermédiaire proposé', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /^Marathon/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: /Je n'ai jamais couru/ }).click();
  await continueUntil(page, planHeading(page));
  await expect(page.getByText('Objectif trop ambitieux pour cette date.')).toBeVisible();
  await page.getByRole('button', { name: /Viser un 5 km à cette date/ }).click();
  await expect(page.getByText('Objectif trop ambitieux pour cette date.')).toBeHidden();
});

test('saisie des nombres : taper « 14 » pour la VMA ne saute pas au minimum', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /^10 km/ }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('radio', { name: 'Ma VMA' }).click();
  const vma = page.getByRole('textbox', { name: 'VMA' });
  await vma.fill('');
  await vma.pressSequentially('16');
  await expect(vma).toHaveValue('16');
  await vma.blur();
  await expect(vma).toHaveValue('16');
});

test('répertoire des courses du Québec : choisir une course pré-remplit nom, date et distance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('radio', { name: /^10 km/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Trouver une course au Québec')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Rechercher une course' }).fill('saint-hyacinthe');
  const first = page.getByRole('region', { name: 'Répertoire des courses du Québec' }).getByRole('button').first();
  await expect(first).toBeVisible();
  const title = (await first.locator('span').first().innerText()).trim();
  await first.click();
  await expect(page.getByRole('textbox', { name: /Nom/ })).toHaveValue(title);
});

test('profil : refaire le plan avec de nouvelles dispos', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Plus' }).click();
  await page.getByRole('link', { name: /^Profil/ }).click();
  const replan = page.getByRole('button', { name: 'Refaire mon plan avec ces dispos' });
  await replan.scrollIntoViewIfNeeded();
  // Le message « Sentier marche maintenant hors-ligne » peut recouvrir le bas de la page.
  const ok = page.getByRole('button', { name: 'OK', exact: true });
  if (await ok.isVisible()) await ok.click();
  await replan.click({ force: true });
  await expect(page.getByText(/Plan refait avec tes nouvelles dispos|Le plan n'a pas changé/)).toBeVisible();
});

test('muscu : logger une série, le repos démarre, la séance est enregistrée', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Plus' }).click();
  await page.getByRole('link', { name: 'Séance de muscu libre' }).click();
  await expect(page.getByRole('heading', { name: /Muscu générale/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Squat gobelet' })).toBeVisible();
  await expect(page.getByText('Première fois.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Série 1 faite' }).first().click();
  await expect(page.getByRole('timer', { name: 'Repos' })).toBeVisible();
  await page.getByRole('button', { name: 'Passer' }).click();
  await expect(page.getByRole('timer', { name: 'Repos' })).toBeHidden();
  await page.getByRole('button', { name: /Enregistrer la séance \(1 série\)/ }).click();
  await expect(page).toHaveURL(/\/$/);
  // La séance suivante part de ce qui a été fait (double progression).
  await page.getByRole('link', { name: 'Plus' }).click();
  await page.getByRole('link', { name: 'Séance de muscu libre' }).click();
  await expect(page.getByText('+1 rep.')).toBeVisible();
});

test('progrès : tendances calculées par le moteur à partir de l’historique de démo', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Progrès' }).click();
  await expect(page.getByRole('heading', { name: 'Progrès' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Distribution des zones' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Répartition : Z1/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Efficacité aérobie' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'VO2max estimée' })).toBeVisible();
});

test('équipement : ajouter une paire neuve, la porter au log rapide, ses km montent', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Plus' }).click();
  await page.getByRole('link', { name: /Équipement/ }).click();
  await expect(page.getByRole('heading', { name: 'Équipement' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Peregrine 15' })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une paire' }).click();
  await page.getByRole('textbox', { name: 'Nom' }).fill('Speedgoat neuve');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Speedgoat neuve' })).toBeVisible();
  await expect(page.getByText('En rodage').first()).toBeVisible();
  await expect(page.getByRole('progressbar', { name: /Speedgoat neuve : 0 km sur 700/ })).toBeVisible();
  await page.getByRole('link', { name: "Aujourd'hui" }).click();
  await page.getByRole('button', { name: "C'est fait" }).click();
  await page.getByRole('button', { name: /Speedgoat neuve · 0 km/ }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeHidden();
  await page.getByRole('link', { name: 'Plus' }).click();
  await page.getByRole('link', { name: /Équipement/ }).click();
  await expect(page.getByRole('progressbar', { name: /Speedgoat neuve : \d+ km sur 700/ })).not.toHaveAttribute('aria-valuenow', '0');
});

test('nutrition : noter une sortie longue fait monter la cible de glucides', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Plus' }).click();
  await page.getByRole('link', { name: /Nutrition/ }).click();
  await expect(page.getByRole('heading', { name: "Nutrition d'effort" })).toBeVisible();
  await expect(page.getByTestId('gut-next')).toContainText('30 g de glucides par heure');
  await expect(page.getByRole('list', { name: 'Horaire des prises' })).toBeVisible();
  await page.getByRole('link', { name: "Aujourd'hui" }).click();
  await page.getByRole('button', { name: "C'est fait" }).click();
  await page.getByRole('textbox', { name: 'Durée' }).fill('120');
  await page.getByRole('button', { name: 'Noter ma nutrition' }).click();
  await page.getByRole('textbox', { name: 'Glucides pris (total)' }).fill('100');
  await page.getByRole('radio', { name: '0' }).click();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeHidden();
  await page.getByRole('link', { name: 'Plus' }).click();
  await page.getByRole('link', { name: /Nutrition/ }).click();
  await expect(page.getByTestId('gut-next')).toContainText('60 g de glucides par heure'); // 50 g/h bien toléré → +10
  await expect(page.getByText('inconfort 0/5')).toBeVisible();
});

test('corps : la carte montre la douleur, la routine ciblée apparaît, la prévention se coche', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('link', { name: 'Corps' }).click();
  await expect(page.getByRole('heading', { name: 'Corps' })).toBeVisible();
  // Toucher une zone de la carte la sélectionne pour la déclarer.
  await page.getByRole('button', { name: /tibia droit : rien à signaler/ }).click();
  await page.getByRole('slider', { name: 'Intensité' }).fill('2');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('button', { name: /tibia droit : gêne/ })).toBeVisible();
  await expect(page.getByRole('button', { name: "Tibias : tibial antérieur fait aujourd'hui" })).toBeVisible();
  await expect(page.getByText('ciblée', { exact: true })).toBeVisible();
  // Cocher une routine de base.
  await expect(page.getByText('0/2 cette semaine').first()).toBeVisible();
  await page.getByRole('button', { name: "Mollets et soléaire fait aujourd'hui" }).click();
  await expect(page.getByText('1/2 cette semaine').first()).toBeVisible();
  await page.getByRole('button', { name: 'Voir les exercices' }).first().click();
  await expect(page.getByText(/Mollets debout sur une jambe/)).toBeVisible();
});

test('jalons : un cap franchi au log rapide apparaît sur Aujourd’hui et dans Progrès', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('Séance du jour')).toBeVisible();
  await page.getByRole('button', { name: "C'est fait" }).click();
  await page.getByRole('textbox', { name: 'Distance' }).fill('50');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeHidden();
  await expect(page.getByText('Bravo', { exact: true })).toBeVisible();
  await expect(page.getByText('Premier 50 km')).toBeVisible();
  await page.getByRole('link', { name: 'Progrès' }).click();
  await expect(page.getByRole('heading', { name: 'Jalons' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Jalons atteints' }).getByText('Premier 50 km')).toBeVisible();
});
