export type CategoryTone =
  | "emerald"
  | "sky"
  | "rose"
  | "amber"
  | "violet"
  | "zinc";

export type MedicationCategory = string;

export type WeekDay =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type MedicationScheduleType = "timed" | "ordered";
export type MedicationDayMode =
  | "daily"
  | "weekdays"
  | "even-dates"
  | "odd-dates";

export interface MedicationSchedule {
  type: MedicationScheduleType;
  dayMode: MedicationDayMode;
  times: string[];
  days: WeekDay[];
  order?: number;
  routineCategoryId?: string;
  groupName?: string;
}

export interface MedicationCategoryOption {
  id: string;
  name: string;
  tone: CategoryTone;
}

export interface RoutineCategory {
  id: string;
  name: string;
  tone: CategoryTone;
  sortOrder: number;
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
  routineCategoryId?: string;
  routineCategoryName?: string;
  groupName?: string;
  takenAt: string;
  date: string;
  status: "taken";
  notes?: string;
}
