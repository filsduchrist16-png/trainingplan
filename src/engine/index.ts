/**
 * API publique du moteur de coaching Sentier.
 * Logique pure : aucune dépendance UI, stockage ou navigateur. Voir docs/ENGINE.md.
 */
export * from './types';
export * as C from './constants';
export { addDays, diffDays, mondayOf, weekday, dayOfWeek, toIsoDate, isBetween } from './dates';
export { explain, bySeverity, worstSeverity } from './explain';
export { zonesFromHrMax, zonesKarvonen, estimateHrMax, zoneOf, zoneRange, timeInZones, greyZone, hrMaxFromTest, ZONE_FEEL } from './zones';
export { vdotFromRace, vdotFromVma, predictRaceTime, pacesFromVdot, easyPace, easyMinutes, formatPace, isPlausibleVdot, suggestVdotUpdate, type PaceKey, type QualityResult } from './paces';
export { activityLoad, dailyLoads, acwr, acwrEwma, type AcwrResult, type AcwrStatus, type LoadBasis } from './load';
export { weeklySummaries, progressionReference, maxAllowedVolume, checkWeekProgression, type WeekSummary } from './progression';
export { GOALS, DIFFICULTY_FACTOR, trailGoalFor, type GoalFamily, type GoalProfile } from './goals';
export { SESSION_LIBRARY, sessionInfo, isKeyType, isRunType, type SessionInfo, type SessionCategory } from './library';
export { generatePlan, generateRecovery, toMaintenanceWeek, allocatePhases, timeCapKm, type PlanRequest, type PlanDraft, type WeekPlan } from './periodization';
export { buildWeekSessions, pickRunDays, validateMove, type WeekContext, type SessionDraft, type MovableSession } from './scheduling';
export { paceForTarget, measure } from './builders';
export { evaluateHealth, healthLight, zoneLabel, type HealthStatus, type HealthLevel, type HealthInput } from './guards';
export { adjustToday, findMoveTarget, scaleSession, easySession, crossSession, restSession, type DayDecision, type DayAction, type TodaySession } from './readiness';
export { debrief, cardiacDrift, type Debrief, type DebriefInput } from './debrief';
