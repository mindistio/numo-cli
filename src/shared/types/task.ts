export type WeekDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface RepeatConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'none';
  every: number | null;
  end: 'never' | 'onDate' | 'afterOccurrences' | null;
  endDate: number | null;
  endAfter: number | null;
  monthDays: number[] | null;
  weekDays: WeekDay[] | null;
}

export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface ITask {
  id: string;
  text: string;
  isPublic: boolean;
  completed: boolean;
  completedAt: number | null;   // Unix ms
  createdAt: number;
  dueDate: string | null;
  remindDate: string | null;
  tags: string[];
  note: string;
  priority: number;
  difficulty: 0 | 1 | 2 | 3 | null;
  duration: number;
  backlog?: boolean;
  parentTaskId: string | null;
  completions: number;
  repeat: RepeatConfig;
  subtasks: SubTask[];
  withTime?: boolean;
  listPosition?: string | null;
}

export interface IKarmaRecord {
  entity: string;         // 'addTask' | 'completeTask' | 'completeSubtask'
  entityId: string;
  karma: number;
  text: string;
  createdAt: number;
  userId: string;
}

export interface IRoutineStreak {
  taskId: string;
  userId: string;
  streak: number;
  longestStreak: number;
  lastCompletedAt: number | null;
}
