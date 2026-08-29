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
export type MedicationTrackingMode = "completion" | "avoidance";
export type IntakeLogStatus = "taken" | "lapse";
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
  /**
   * When true, an unmet scheduled Care Day stays on the checklist on later
   * Care Days until the user marks one use, or the next scheduled Care Day
   * arrives (previous obligation is then abandoned).
   */
  catchUpUntilNextScheduledDay?: boolean;
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
  /** Completion items are done when performed; avoidance items can record a lapse. */
  trackingMode?: MedicationTrackingMode;
  /** First care-day (yyyy-MM-dd) this item counts toward due/adherence. */
  activeFrom?: string;
  /** Last care-day (yyyy-MM-dd) this item counts toward due/adherence after deactivation. */
  activeUntil?: string;
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
  /** `lapse` records a negative avoidance event and never counts as completion. */
  status: IntakeLogStatus;
  notes?: string;
}
