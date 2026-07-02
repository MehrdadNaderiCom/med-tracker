export type MedicationCategory =
  | "skin"
  | "hair"
  | "blood-pressure"
  | "liver"
  | "other";

export type WeekDay =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type MedicationScheduleType = "timed" | "ordered";

export interface MedicationSchedule {
  type: MedicationScheduleType;
  times: string[];
  days: WeekDay[];
  order?: number;
  groupName?: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  unit: string;
  category: MedicationCategory;
  schedule: MedicationSchedule;
  notes: string;
  isActive: boolean;
}

export interface IntakeLog {
  id: string;
  medicationId: string;
  medicationName: string;
  dosage: string;
  unit: string;
  category: MedicationCategory;
  scheduleType: MedicationScheduleType;
  scheduledTime: string | null;
  order?: number;
  groupName?: string;
  takenAt: string;
  date: string;
  status: "taken";
  notes?: string;
}
