import type { SessionType, Step } from './types';

/**
 * Bibliothèque des types de séances.
 * Chaque fiche dit : quoi faire, ce que ça construit, pourquoi c'est pertinent, le signe que ça marche,
 * l'erreur classique, et la version minimale viable (MVV) pour les journées où la vie gagne.
 */

export type SessionCategory = 'repos' | 'facile' | 'qualite' | 'longue' | 'force' | 'croise' | 'test' | 'course';

export interface SessionInfo {
  label: string;
  category: SessionCategory;
  /** Compte comme séance clé (stress élevé, 48 h d'écart). */
  isKey: boolean;
  /** Pas de course : ne compte pas dans le volume. */
  isRun: boolean;
  prescription: string;
  adaptations: string;
  why: string;
  signWorks: string;
  classicMistake: string;
  mvv: { title: string; minutes: number; steps: Step[] };
  /** Résumé d'une ligne pour la carte « séance du jour ». */
  oneLiner: string;
}

const z1 = { zone: 'z1' as const };
const z2 = { zone: 'z2' as const };
const easyMvv = { title: '20 min Z1 + 5 strides', minutes: 25, steps: [{ kind: 'continu' as const, minutes: 20, target: z1 }, { kind: 'effort' as const, seconds: 20, repeat: 5, target: { rpe: 7 }, note: 'strides relâchés, récup marchée' }] };

export const SESSION_LIBRARY: Record<SessionType, SessionInfo> = {
  repos: {
    label: 'Repos', category: 'repos', isKey: false, isRun: false,
    prescription: 'Rien. Ou une marche, de la mobilité, une sieste si le bébé le permet.',
    adaptations: "C'est pendant le repos que l'entraînement se transforme en forme.",
    why: 'Le stress + la récupération = la progression. Sans récupération, le stress ne fait que fatiguer.',
    signWorks: 'Tu repars le lendemain avec des jambes fraîches et l’envie de courir.',
    classicMistake: 'Transformer le repos en « petite sortie de rien » qui finit en Z3.',
    mvv: { title: 'Repos', minutes: 0, steps: [] },
    oneLiner: 'Repos : la forme se construit aujourd’hui.',
  },
  z1_recup: {
    label: 'Récup Z1', category: 'facile', isKey: false, isRun: true,
    prescription: '20-40 min en Z1, terrain plat et doux.',
    adaptations: 'Circulation, récupération active, volume « gratuit » sans stress.',
    why: 'Bouger relance la récupération après une grosse séance sans ajouter de fatigue.',
    signWorks: 'Tu finis plus frais qu’au départ.',
    classicMistake: 'Courir trop vite parce que « c’est juste 30 min ».',
    mvv: { title: '15 min Z1', minutes: 15, steps: [{ kind: 'continu', minutes: 15, target: z1 }] },
    oneLiner: 'Z1 : récup active, on bouge sans fatiguer.',
  },
  z2_endurance: {
    label: 'Endurance Z2', category: 'facile', isKey: false, isRun: true,
    prescription: '40-75 min en Z2, test du parler : phrases complètes.',
    adaptations: 'Mitochondries, capillaires, utilisation des graisses, solidité des tissus (os, tendons).',
    why: 'Le pilier : environ 80 % du volume. C’est ce qui rend tout le reste possible, et c’est doux pour le tibia.',
    signWorks: 'À FC égale, ton allure s’améliore de semaine en semaine.',
    classicMistake: 'Glisser en zone grise (haut Z2 / bas Z3) : trop dur pour récupérer, trop facile pour progresser.',
    mvv: easyMvv,
    oneLiner: 'Z2 pur : on bâtit les mitochondries et on protège les tibias.',
  },
  strides: {
    label: 'Z2 + strides', category: 'facile', isKey: false, isRun: true,
    prescription: 'Sortie Z2, puis 6-8 × 20 s rapides et relâchées, récup complète en marchant.',
    adaptations: 'Économie de course, coordination, cadence, recrutement neuromusculaire sans fatigue.',
    why: 'Garde de la vitesse dans les jambes et pousse la cadence vers le haut sans stress métabolique.',
    signWorks: 'Les strides deviennent fluides, la foulée plus courte et rapide.',
    classicMistake: 'Les faire en sprint crispé, ou raccourcir la récup.',
    mvv: easyMvv,
    oneLiner: 'Z2 + strides : de la vitesse sans fatigue.',
  },
  hill_sprints: {
    label: 'Sprints en côte', category: 'facile', isKey: false, isRun: true,
    prescription: 'Échauffement Z2, 6-10 × 8-10 s en côte raide à fond, récup complète 2 min.',
    adaptations: 'Force et puissance, recrutement des fibres rapides, rigidité tendineuse protectrice.',
    why: 'De la force spécifique à très faible coût de fatigue ; la pente limite l’impact.',
    signWorks: 'Tu montes plus « haut » sur tes appuis, avec une poussée plus franche.',
    classicMistake: 'Faire 20 s au lieu de 8-10 : ça devient du lactique.',
    mvv: easyMvv,
    oneLiner: 'Sprints en côte : force et puissance, presque gratuites.',
  },
  cotes_longues: {
    label: 'Côtes longues', category: 'qualite', isKey: true, isRun: true,
    prescription: '4-6 × 3-6 min en montée en Z3-Z4, redescente en trottinant. Bâtons possibles en phase spécifique.',
    adaptations: 'Force-endurance des quadriceps et mollets, seuil, économie en montée.',
    why: 'Le trail se gagne en montée. C’est du travail de seuil où les impacts sont faibles.',
    signWorks: 'Même FC, plus de vitesse verticale (m/h) sur ta côte de référence.',
    classicMistake: 'Partir trop fort sur la 1re répétition et finir en marchant.',
    mvv: { title: '3 × 3 min en côte Z3', minutes: 30, steps: [{ kind: 'echauffement', minutes: 10, target: z2 }, { kind: 'effort', minutes: 3, repeat: 3, target: { zone: 'z3' } }, { kind: 'retour_calme', minutes: 5, target: z1 }] },
    oneLiner: 'Côtes longues : la force de monter, à faible impact.',
  },
  seuil: {
    label: 'Seuil', category: 'qualite', isKey: true, isRun: true,
    prescription: 'Cruise intervals (3-4 × 8-10 min en Z4 basse / allure T, 2 min récup), puis seuil continu 20-30 min.',
    adaptations: 'Seuil lactique : tenir plus vite plus longtemps sans exploser.',
    why: 'La qualité la plus rentable pour l’endurance : on repousse ce qui fait mal à 2 h de course.',
    signWorks: 'Allure T plus rapide à FC égale, ou mêmes répétitions avec moins de FC.',
    classicMistake: 'Courir le seuil à l’allure 10 km : c’est trop vite, ça devient du VO2.',
    mvv: { title: '2 × 8 min seuil', minutes: 35, steps: [{ kind: 'echauffement', minutes: 12, target: z2 }, { kind: 'effort', minutes: 8, repeat: 2, target: { pace: 'T' } }, { kind: 'retour_calme', minutes: 5, target: z1 }] },
    oneLiner: 'Seuil : tenir plus vite, plus longtemps.',
  },
  vo2max: {
    label: 'VO2max', category: 'qualite', isKey: true, isRun: true,
    prescription: '5-6 × 3-4 min en Z5 (allure I), récup égale ; variantes 30/30 ou 40/20. En côte pour le trail.',
    adaptations: 'Plafond aérobie (VO2max), débit cardiaque.',
    why: 'Remonte le plafond. Une fois par semaine maximum, et seulement après une base solide.',
    signWorks: 'Les répétitions se tiennent avec une allure stable ; VO2max estimée en hausse sur 4-8 semaines.',
    classicMistake: 'En faire plus d’une fois par semaine, ou avant 4-6 semaines de base.',
    mvv: { title: '10 × 30/30', minutes: 30, steps: [{ kind: 'echauffement', minutes: 12, target: z2 }, { kind: 'effort', seconds: 30, repeat: 10, target: { pace: 'I' }, note: '30 s vite / 30 s trot' }, { kind: 'retour_calme', minutes: 8, target: z1 }] },
    oneLiner: 'VO2max : on remonte le plafond.',
  },
  tempo: {
    label: 'Allure course', category: 'qualite', isKey: true, isRun: true,
    prescription: 'Blocs à allure objectif (M pour marathon, semi entre M et T), 2-3 × 10-20 min.',
    adaptations: 'Économie à l’allure de course, confiance, gestion de l’effort.',
    why: 'La spécificité : apprendre à ton corps exactement ce qu’on va lui demander le jour J.',
    signWorks: 'L’allure cible devient « confortablement dure » avec une FC stable.',
    classicMistake: 'Courir plus vite que l’allure objectif « parce que ça va bien ».',
    mvv: { title: '2 × 8 min allure course', minutes: 35, steps: [{ kind: 'echauffement', minutes: 12, target: z2 }, { kind: 'effort', minutes: 8, repeat: 2, target: { pace: 'M' } }, { kind: 'retour_calme', minutes: 5, target: z1 }] },
    oneLiner: 'Allure course : répéter le jour J.',
  },
  descentes: {
    label: 'Descentes techniques', category: 'facile', isKey: false, isRun: true,
    prescription: 'Sortie Z2 avec 4-8 descentes techniques contrôlées (1-3 min), regard loin, pas courts.',
    adaptations: 'Charge excentrique des quadriceps, proprioception, technique de pied.',
    why: 'Les quads lâchent en descente bien avant le cardio. Ça s’entraîne, progressivement.',
    signWorks: 'Moins de courbatures après les longues, plus de vitesse en descente sans crispation.',
    classicMistake: 'En faire la veille d’une séance clé : les quads ne récupèrent pas.',
    mvv: easyMvv,
    oneLiner: 'Descentes : des quads à l’épreuve des cailloux.',
  },
  longue_facile: {
    label: 'Sortie longue', category: 'longue', isKey: false, isRun: true,
    prescription: '1 h 15 - 3 h en Z2, sur le terrain de ta course si possible. Gut training dès 75 min.',
    adaptations: 'Endurance, utilisation des graisses, résistance musculaire, tolérance digestive.',
    why: 'Le cœur de la préparation endurance. Facile = assez lente pour finir en Z2.',
    signWorks: 'Tu finis la longue sans dérive cardiaque et avec l’envie de continuer un peu.',
    classicMistake: 'Partir en Z2, finir en Z3 : la dérive veut dire trop vite ou pas assez mangé.',
    mvv: { title: '60 min Z2', minutes: 60, steps: [{ kind: 'continu', minutes: 60, target: z2 }] },
    oneLiner: 'Longue facile : l’endurance se bâtit ici.',
  },
  longue_specifique: {
    label: 'Longue spécifique', category: 'longue', isKey: true, isRun: true,
    prescription: 'Longue sur terrain race-like avec D+, blocs à effort de course, nutrition et matériel de course.',
    adaptations: 'Spécificité : effort, terrain, nutrition, mental.',
    why: 'Répétition générale : tout ce qui n’est pas testé à l’entraînement est un pari le jour J.',
    signWorks: 'Effort de course stable sur la durée, ventre qui tient, aucun frottement.',
    classicMistake: 'La transformer en course : on finit vidé pour 10 jours.',
    mvv: { title: '75 min sentier Z2', minutes: 75, steps: [{ kind: 'continu', minutes: 75, target: z2 }] },
    oneLiner: 'Longue spécifique : répétition générale.',
  },
  back_to_back: {
    label: 'Back-to-back', category: 'longue', isKey: true, isRun: true,
    prescription: 'Deux sorties moyennes-longues sur deux jours consécutifs, la 2e sur jambes fatiguées en Z2.',
    adaptations: 'Endurance sur fatigue sans le coût d’une seule sortie énorme.',
    why: 'Simule la 2e moitié d’un long trail en protégeant les tissus. Seulement en phase pic.',
    signWorks: 'La 2e sortie reste en Z2 avec une allure correcte.',
    classicMistake: 'Courir la 1re trop vite : la 2e devient une survie.',
    mvv: { title: '60 min Z2', minutes: 60, steps: [{ kind: 'continu', minutes: 60, target: z2 }] },
    oneLiner: 'Back-to-back : de l’endurance sur jambes fatiguées.',
  },
  marche_course: {
    label: 'Marche-course', category: 'facile', isKey: false, isRun: true,
    prescription: 'Alterner course facile et marche (ex. 1 min / 1 min), en allongeant la course chaque semaine.',
    adaptations: 'Adaptation progressive des os, tendons et du cœur, sans blessure.',
    why: 'Partir de zéro sans se blesser : on habitue les tissus avant d’enchaîner.',
    signWorks: 'Les blocs de course s’allongent et la marche devient optionnelle.',
    classicMistake: 'Sauter des étapes parce que le souffle suit : les tibias, eux, suivent plus lentement.',
    mvv: { title: '15 min marche-course', minutes: 15, steps: [{ kind: 'effort', minutes: 1, repeat: 7, target: z2, note: '1 min course / 1 min marche' }] },
    oneLiner: 'Marche-course : on bâtit les fondations, une minute à la fois.',
  },
  evaluation: {
    label: 'Séance d’évaluation', category: 'test', isKey: false, isRun: true,
    prescription: '5 min de marche, puis course facile jusqu’à 10 min au plus : arrête dès que parler devient difficile. Note combien de minutes tu as couru.',
    adaptations: 'Mesure : combien de minutes tu cours d’affilée, en aisance. C’est ce qui fixe ton point de départ.',
    why: 'Plutôt que de deviner, on mesure : un départ trop prudent démotive, un départ trop dur blesse.',
    signWorks: 'Ton plan démarre au bon palier, ni trop facile ni trop dur.',
    classicMistake: 'Forcer pour « réussir » le test : ce n’est pas une performance, arrête dès que tu ne peux plus parler.',
    mvv: { title: 'Reporter l’évaluation', minutes: 0, steps: [] },
    oneLiner: 'Évaluation : on mesure ton point de départ au lieu de le deviner.',
  },
  test: {
    label: 'Test de calibration', category: 'test', isKey: true, isRun: true,
    prescription: 'Échauffement 15 min, puis 3 km le plus vite possible sur terrain plat (ou paliers croissants), retour au calme.',
    adaptations: 'Mesure : FCmax observée et niveau de forme (VDOT) pour calibrer tes zones et allures.',
    why: 'Des zones estimées peuvent être à ±10 bpm. Un test, et tout le plan devient juste.',
    signWorks: 'Tes séances Z2 « tombent » naturellement en Z2.',
    classicMistake: 'Partir en sprint et s’effondrer : vise un effort régulier, finis fort.',
    mvv: { title: 'Reporter le test', minutes: 0, steps: [] },
    oneLiner: 'Test : on calibre tes zones pour de vrai.',
  },
  course: {
    label: 'Jour de course', category: 'course', isKey: true, isRun: true,
    prescription: 'Ton plan de course : allure, ravitos, matériel. Rien de nouveau aujourd’hui.',
    adaptations: 'Tout ce que tu as bâti.',
    why: 'Le jour J.',
    signWorks: 'Tu gères ta course au lieu de la subir.',
    classicMistake: 'Partir sur l’adrénaline au-dessus de ton allure.',
    mvv: { title: 'Course', minutes: 0, steps: [] },
    oneLiner: 'Jour de course. Profite.',
  },
  croise: {
    label: 'Entraînement croisé', category: 'croise', isKey: false, isRun: false,
    prescription: 'Vélo, natation ou elliptique en Z2, même durée que la course remplacée.',
    adaptations: 'Maintien aérobie sans impact.',
    why: 'Garde le moteur pendant que les tissus récupèrent.',
    signWorks: 'Tu reviens à la course sans avoir perdu ton fond.',
    classicMistake: 'En profiter pour faire du gros intensif « parce que ça ne cogne pas ».',
    mvv: { title: '20 min vélo Z2', minutes: 20, steps: [{ kind: 'continu', minutes: 20, target: z2 }] },
    oneLiner: 'Croisé : le moteur tourne, les tibias se reposent.',
  },
  muscu_generale: {
    label: 'Muscu générale', category: 'force', isKey: false, isRun: false,
    prescription: 'Squat, soulevé de terre, hip thrust, pompes, tirage : 3-4 × 6-8 à RPE 7-8. Mollets genou fléchi.',
    adaptations: 'Force maximale, rigidité tendineuse, économie de course, résistance des tissus.',
    why: 'Un coureur plus fort se blesse moins et dépense moins d’énergie par foulée.',
    signWorks: 'Les charges montent (double progression) sans douleur articulaire.',
    classicMistake: 'Faire de l’endurance musculaire (3 × 20) au lieu de la force.',
    mvv: { title: 'Mollets + gainage 15 min', minutes: 15, steps: [] },
    oneLiner: 'Muscu : des jambes qui encaissent.',
  },
  muscu_trail: {
    label: 'Muscu trail', category: 'force', isKey: false, isRun: false,
    prescription: 'Split squats bulgares et step-downs (descente 3-4 s), mollets genou fléchi + tendu 3-4 × 12-15, Nordic curls, RDL unilatéral, Pallof press.',
    adaptations: 'Force excentrique (descentes), stabilité unilatérale, mollets et soléaire.',
    why: 'Les descentes et les tibias se préparent au gym. L’excentrique lent protège les quads et le périoste.',
    signWorks: 'Moins de courbatures après les descentes, mollets qui tiennent sur les longues.',
    classicMistake: 'Descendre vite : c’est la phase lente (3-4 s) qui fait le travail.',
    mvv: { title: 'Mollets + step-downs 15 min', minutes: 15, steps: [] },
    oneLiner: 'Muscu trail : des quads pour les descentes.',
  },
  plyo: {
    label: 'Plyométrie', category: 'force', isKey: false, isRun: false,
    prescription: 'Petit volume, haute qualité : sauts, bonds, pogo. 3 × 6 > 5 × 20.',
    adaptations: 'Réactivité, raideur du tendon, économie de course.',
    why: 'Transforme la force en ressort. La qualité compte plus que la quantité.',
    signWorks: 'Contacts au sol courts et silencieux.',
    classicMistake: 'En faire trop, fatigué, sur surface dure.',
    mvv: { title: '3 × 6 pogo', minutes: 5, steps: [] },
    oneLiner: 'Plyo : du ressort dans la foulée.',
  },
};

export function sessionInfo(type: SessionType): SessionInfo {
  return SESSION_LIBRARY[type];
}

export function isKeyType(type: SessionType): boolean {
  return SESSION_LIBRARY[type].isKey;
}

export function isRunType(type: SessionType): boolean {
  return SESSION_LIBRARY[type].isRun;
}
