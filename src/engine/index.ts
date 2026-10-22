/**
 * API publique du moteur de coaching Sentier.
 * Logique pure : aucune dépendance UI, stockage ou navigateur. Voir docs/ENGINE.md.
 */
export * from './types';
export * as C from './constants';
export { addDays, diffDays, mondayOf, weekday, dayOfWeek, toIsoDate, isBetween } from './dates';
export { explain, bySeverity, worstSeverity } from './explain';
export { zonesFromHrMax, zonesKarvonen, estimateHrMax, zoneOf, zoneRange, timeInZones, greyZone, hrMaxFromTest, zoneTarget, ZONE_FEEL } from './zones';
export { vdotFromRace, vdotFromVma, predictRaceTime, pacesFromVdot, easyPace, easyMinutes, formatPace, isPlausibleVdot, suggestVdotUpdate, type PaceKey, type QualityResult } from './paces';
export { activityLoad, dailyLoads, acwr, acwrEwma, type AcwrResult, type AcwrStatus, type LoadBasis } from './load';
export { weeklySummaries, progressionReference, maxAllowedVolume, checkWeekProgression, type WeekSummary } from './progression';
export { GOALS, DIFFICULTY_FACTOR, trailGoalFor, type GoalFamily, type GoalProfile } from './goals';
export { SESSION_LIBRARY, sessionInfo, isKeyType, isRunType, type SessionInfo, type SessionCategory } from './library';
export { generatePlan, generateRecovery, toMaintenanceWeek, allocatePhases, timeCapKm, type PlanRequest, type PlanDraft, type WeekPlan } from './periodization';
export { buildWeekSessions, pickRunDays, rescheduleJourney, validateMove, type JourneySlot, type WeekContext, type SessionDraft, type MovableSession } from './scheduling';
export { paceForTarget, measure } from './builders';
export { startMode, firstStage, type StartMode, type StartInput } from './startmode';
export {
  JOURNEY_DONE, LADDER_LAST, STAGE_WALK, TRANSITION_LAST, initialRunWalkState, nextRunWalkState, projectStages, sessionsToReach,
  stageDurationMinutes, stageKind, stageLabel, stageRunMinutes, validationsRequired, walkFirstMinutes,
  type RunWalkOptions, type RunWalkSession, type RunWalkState,
} from './runwalk';
export { EXERCISES, strengthProgram, nextTarget, tempoSteps, type ExerciseInfo, type NextTarget, type ProgramInput, type ProgramRow, type SetResult, type StrengthKind, type StrengthProgram } from './strength';
export { deriveProfile, bmi, notesFor, POSTPARTUM_RETURN_TEST, POSTPARTUM_SYMPTOMS, type ProfileAdjustments, type ProfileInput, type SessionNote } from './profiles';
export { screen, HEALTH_QUESTIONS, type Screening, type ScreeningLevel } from './screening';
export { evaluateHealth, healthLight, zoneLabel, type HealthStatus, type HealthLevel, type HealthInput } from './guards';
export { adjustToday, findMoveTarget, scaleSession, easySession, crossSession, restSession, type DayDecision, type DayAction, type TodaySession } from './readiness';
export { debrief, cardiacDrift, type Debrief, type DebriefInput } from './debrief';
