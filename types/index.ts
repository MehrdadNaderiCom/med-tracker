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

export interface MedicationSchedule {
  times: string[];
  days: WeekDay[];
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
  scheduledTime: string;
  takenAt: string;
  date: string;
  status: "taken";
  notes?: string;
}
