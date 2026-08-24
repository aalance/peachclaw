export const AgentWorkState = {
  Idle: 'idle',
  Listening: 'listening',
  Thinking: 'thinking',
  Planning: 'planning',
  WaitingApproval: 'waiting_approval',
  Reading: 'reading',
  Writing: 'writing',
  Browsing: 'browsing',
  Coding: 'coding',
  Executing: 'executing',
  Completed: 'completed',
  Failed: 'failed',
} as const;
export type AgentWorkState = typeof AgentWorkState[keyof typeof AgentWorkState];

export const PetIpcChannel = {
  ShowWorkbench: 'pet:showWorkbench',
  ToggleMouseIgnore: 'pet:toggleMouseIgnore',
  GetMouseIgnore: 'pet:getMouseIgnore',
  DragStart: 'pet:dragStart',
  DragMove: 'pet:dragMove',
  CloseApprovalWindow: 'pet:closeApprovalWindow',
  GetModelImage: 'pet:getModelImage',
  SetState: 'pet:setState',
  GetState: 'pet:getState',
  AddTaskReward: 'pet:addTaskReward',
  Feed: 'pet:feed',
  SetVisible: 'pet:setVisible',
  GetVisible: 'pet:getVisible',
  VisibilityChanged: 'pet:visibilityChanged',
  NotifyAppearanceChanged: 'pet:notifyAppearanceChanged',
  AppearanceChanged: 'pet:appearanceChanged',
} as const;
export type PetIpcChannel = typeof PetIpcChannel[keyof typeof PetIpcChannel];

export const PetRewardSource = {
  Chat: 'chat',
  FileTask: 'file_task',
  BrowserTask: 'browser_task',
  Workflow: 'workflow',
  Helpful: 'helpful',
} as const;
export type PetRewardSource = typeof PetRewardSource[keyof typeof PetRewardSource];

export const PetResourcePackStatus = {
  Installed: 'installed',
  Downloadable: 'downloadable',
} as const;
export type PetResourcePackStatus = typeof PetResourcePackStatus[keyof typeof PetResourcePackStatus];

export interface PetResourcePack {
  id: string;
  name: string;
  description: string;
  status: PetResourcePackStatus;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    ink: string;
  };
}

export interface PetAppearance {
  selectedPackId: string;
  customName?: string;
  customImageDataUrl?: string;
  /** Grid layout for a user-uploaded spritesheet. */
  sprite?: PetSpriteConfig;
  /** Per-action frame clips for a user-uploaded spritesheet. */
  actions?: Partial<Record<PetActionKey, PetActionClip>>;
}

/** Action keys the pet can play, mapped to scenarios (working→run, waiting→listen, …). */
export const PetActionKey = {
  Idle: 'idle',
  Run: 'run',
  Listen: 'listen',
  Talk: 'talk',
  Think: 'think',
  Wave: 'wave',
} as const;
export type PetActionKey = typeof PetActionKey[keyof typeof PetActionKey];

export interface PetSpriteConfig {
  columns: number;
  rows: number;
}

export interface PetActionClip {
  frames: number[];
  fps: number;
}

export interface PetReward {
  exp: number;
  energyDelta: number;
  food: number;
  source: PetRewardSource;
  label: string;
  createdAt: number;
}

export interface PetState {
  pet_level: number;
  pet_exp: number;
  pet_energy: number;
  pet_mood: 'happy' | 'focused' | 'tired';
  task_count: number;
  token_usage: number;
  food_count: number;
  last_rewards: PetReward[];
}

export interface PlatformModelPlan {
  providerName: 'PlatformModelProvider';
  currentPlan: string;
  remainingQuota: number;
  dailyUsage: number;
  taskUsage: number;
}