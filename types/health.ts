export interface WeightEntry {
  id: string;
  weightKg: number;
  measuredAt: string;
  careDayKey?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BloodPressureReading {
  systolic: number;
  diastolic: number;
  /** Required by the new-reading form; absent only on retained legacy data. */
  pulseBpm?: number;
  /** Absent on legacy readings whose individual measurement time was not stored. */
  measuredAt?: string;
}

export type BloodPressureReadings =
  | [BloodPressureReading]
  | [BloodPressureReading, BloodPressureReading];

export type BloodPressurePeriod = "morning" | "evening" | "other";
export type BloodPressureArm = "left" | "right" | "unknown";
export type BloodPressurePosition = "seated" | "standing" | "lying" | "unknown";
export type BloodPressureCuffSite = "upper-arm" | "wrist" | "other" | "unknown";
export type BloodPressureMedicationTiming =
  | "before-dose"
  | "after-dose"
  | "unknown";
export type BloodPressureContextFlag =
  | "emotional-stress"
  | "relationship-conflict"
  | "acute-pain"
  | "acute-illness"
  | "poor-sleep"
  | "rushed"
  | "caffeine"
  | "nicotine"
  | "exercise"
  | "alcohol"
  | "meal"
  | "full-bladder"
  | "talking"
  | "not-rested"
  | "positioning-issue"
  | "cuff-issue"
  | "other";
export type BloodPressureSymptom =
  | "dizziness"
  | "fainting"
  | "nausea"
  | "confusion"
  | "blurred-vision"
  | "palpitations";

export type BloodPressureEmergencySymptom =
  | "chest-pain"
  | "shortness-of-breath"
  | "back-pain"
  | "numbness"
  | "weakness"
  | "vision-change"
  | "difficulty-speaking";

export interface BloodPressureSession {
  id: string;
  measuredAt: string;
  careDayKey?: string;
  /** Marks a saved single-reading session as intentionally closed. */
  pairingClosedAt?: string;
  period: BloodPressurePeriod;
  readings: BloodPressureReadings;
  arm: BloodPressureArm;
  position: BloodPressurePosition;
  cuffSite: BloodPressureCuffSite;
  medicationTiming: BloodPressureMedicationTiming;
  standardConditions: boolean | null;
  contextFlags: BloodPressureContextFlag[];
  symptoms: BloodPressureSymptom[];
  emergencySymptoms: BloodPressureEmergencySymptom[];
  triggeredBySymptoms: boolean;
  irregularHeartbeat: boolean | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type DietAdherence = "on-plan" | "mostly-on-plan" | "off-plan";

export interface DietCheckIn {
  id: string;
  measuredAt: string;
  careDayKey?: string;
  adherence: DietAdherence;
  sodiumAware: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type HealthActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "high";

export type WaistMeasurementMethod =
  | "unspecified"
  | "midpoint"
  | "other";

export interface WaistEntry {
  id: string;
  waistCircumferenceCm: number;
  /** ISO instant for new records; YYYY-MM-DD is retained for date-only legacy data. */
  measuredAt: string;
  measuredAtPrecision: "date" | "instant";
  careDayKey?: string;
  measurementMethod: WaistMeasurementMethod;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PerceivedConditioning = "better" | "same" | "worse";

export interface ActivityCheckIn {
  id: string;
  measuredAt: string;
  careDayKey?: string;
  movementMinutes?: number;
  strengthSessions?: number;
  sedentaryHoursPerDay?: number;
  perceivedConditioning?: PerceivedConditioning;
  symptoms?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExerciseActivityType =
  | "stationary-bike"
  | "walking"
  | "outdoor-cycling"
  | "running"
  | "elliptical"
  | "swimming"
  | "strength-training"
  | "mobility"
  | "other-aerobic"
  | "other";

export type ExerciseIntensity =
  | "light"
  | "moderate"
  | "vigorous"
  | "unknown";

export type StrengthMuscleGroup =
  | "legs"
  | "hips"
  | "back"
  | "abdomen"
  | "chest"
  | "shoulders"
  | "arms";

export type StrengthResistanceType =
  | "bodyweight"
  | "free-weight"
  | "machine"
  | "band"
  | "other";

export interface StrengthExerciseLog {
  id: string;
  name: string;
  muscleGroups: StrengthMuscleGroup[];
  resistanceType: StrengthResistanceType;
  setCount: number;
  totalReps?: number;
  loadKg?: number;
}

export interface ExerciseSession {
  id: string;
  /** When the session ended; its Tehran civil date is the canonical exercise day. */
  endedAt: string;
  /** @deprecated Medication-style noon-to-noon key retained only on legacy rows. */
  careDayKey?: string;
  activityType: ExerciseActivityType;
  customActivityName?: string;
  durationMinutes: number;
  intensity: ExerciseIntensity;
  /** Relative effort on a 0–10 scale; useful when heart-rate zones are unreliable. */
  perceivedExertion?: number;
  distanceKm?: number;
  steps?: number;
  averageHeartRateBpm?: number;
  averageCadenceRpm?: number;
  equipmentName?: string;
  resistanceLevel?: string;
  strengthExercises?: StrengthExerciseLog[];
  symptoms?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HealthProfile {
  dateOfBirth: string;
  heightCm: number;
  waistCircumferenceCm: number;
  waistMeasuredAt: string;
  waistMeasurementMethod: WaistMeasurementMethod;
  activityLevel: HealthActivityLevel;
  activityNotes: string;
  dietClinicianName: string;
  dietStartDate: string;
}

export interface HealthSettings {
  baselineWeightKg: number;
  baselineDate: string;
  goalWeightKg: number;
  weightReminderEnabled: boolean;
  weightReminderTime: string;
  bpReminderEnabled: boolean;
  bpMorningReminderTime: string;
  bpEveningReminderTime: string;
  bpCycleStartDate: string;
  bpCycleEndDate: string;
  preferredBpArm: BloodPressureArm;
  bpTargetSystolic: number;
  bpTargetDiastolic: number;
  bpDeviceModel: string;
  bpCuffSize: string;
  dietReminderEnabled: boolean;
  dietReminderTime: string;
  waistReminderEnabled: boolean;
  waistReminderTime: string;
  waistReminderIntervalDays: number;
  activityReminderEnabled: boolean;
  activityReminderTime: string;
  activityReminderIntervalDays: number;
  browserNotifications: boolean;
}

export interface HealthDeletionTombstones {
  weightEntryIds: string[];
  bloodPressureSessionIds: string[];
  dietCheckInIds: string[];
  waistEntryIds: string[];
  activityCheckInIds: string[];
  exerciseSessionIds: string[];
}
