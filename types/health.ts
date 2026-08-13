export interface WeightEntry {
  id: string;
  weightKg: number;
  measuredAt: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BloodPressureReading {
  systolic: number;
  diastolic: number;
  pulseBpm?: number;
}

export type BloodPressurePeriod = "morning" | "evening" | "other";

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
  period: BloodPressurePeriod;
  readings: [BloodPressureReading, BloodPressureReading];
  emergencySymptoms: BloodPressureEmergencySymptom[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type DietAdherence = "on-plan" | "mostly-on-plan" | "off-plan";

export interface DietCheckIn {
  id: string;
  measuredAt: string;
  adherence: DietAdherence;
  sodiumAware: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
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
  dietReminderEnabled: boolean;
  dietReminderTime: string;
  browserNotifications: boolean;
}

export interface HealthDeletionTombstones {
  weightEntryIds: string[];
  bloodPressureSessionIds: string[];
  dietCheckInIds: string[];
}
