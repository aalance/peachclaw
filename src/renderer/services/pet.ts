import {
  AgentWorkState,
  type AgentWorkState as AgentWorkStateValue,
  type PetActionClip,
  type PetActionKey as PetActionKeyValue,
  type PetAppearance,
  type PetResourcePack,
  PetResourcePackStatus,
  type PetReward,
  PetRewardSource,
  type PetRewardSource as PetRewardSourceValue,
  type PetSpriteConfig,
  type PetState,
  type PlatformModelPlan,
} from '../../shared/pet/constants';
import type { CoworkMessage } from '../types/cowork';

const DEFAULT_PET_MODEL_ID = 'peach';
// Informational only: the real default sprite is loaded via the GetModelImage IPC
// handler, which reads the spritesheet bundled under resources/pets (see main.ts).
// Kept as a label so getDefaultPetModelSource() has something stable to return.
export const DEFAULT_PET_MODEL_SPRITESHEET_URL = 'bundled:pets/peach/spritesheet.webp';
export const DEFAULT_PET_MODEL_COLUMNS = 8;
export const DEFAULT_PET_MODEL_ROWS = 9;
// Native spritesheet is 1536×1872, so each of the 8×9 frames is 192×208.
export const DEFAULT_PET_SHEET_WIDTH = 1536;
export const DEFAULT_PET_SHEET_HEIGHT = 1872;
export const DEFAULT_PET_FRAME_WIDTH = 192;
export const DEFAULT_PET_FRAME_HEIGHT = 208;

// Default action → frame mapping for the built-in Peach 8×9 sheet. Each scenario
// shows a distinct pose: working→run, awaiting input→listen, etc. Also used as the
// starting template when a user uploads a custom spritesheet.
export const DEFAULT_PET_ACTIONS: Record<PetActionKeyValue, PetActionClip> = {
  idle: { frames: [0], fps: 1 },
  run: { frames: [8, 9, 10, 11], fps: 8 },
  listen: { frames: [48, 49], fps: 2 },
  talk: { frames: [40, 41, 42, 43], fps: 6 },
  think: { frames: [32, 33], fps: 2 },
  wave: { frames: [24, 25, 26, 27], fps: 5 },
};

const PET_ACTION_KEYS: PetActionKeyValue[] = ['idle', 'run', 'listen', 'talk', 'think', 'wave'];

/** A fully-resolved sprite source the pet window can animate directly. */
export interface PetSpriteSource {
  imageUrl: string;
  columns: number;
  rows: number;
  actions: Record<PetActionKeyValue, PetActionClip>;
}

/**
 * Map an agent work state to the sprite action that best represents it. Streaming
 * assistant output is handled by the caller (it shows `talk` while text flows in).
 */
export const actionForWorkState = (state: AgentWorkStateValue): PetActionKeyValue => {
  switch (state) {
    case AgentWorkState.Listening:
    case AgentWorkState.WaitingApproval:
      return 'listen';
    case AgentWorkState.Thinking:
    case AgentWorkState.Planning:
      return 'think';
    case AgentWorkState.Reading:
    case AgentWorkState.Writing:
    case AgentWorkState.Browsing:
    case AgentWorkState.Coding:
    case AgentWorkState.Executing:
      return 'run';
    case AgentWorkState.Completed:
      return 'wave';
    case AgentWorkState.Idle:
    case AgentWorkState.Failed:
    default:
      return 'idle';
  }
};

let defaultPetModelImagePromise: Promise<string> | null = null;
const PET_STATE_KEY = 'desktop_pet_state';
const PET_APPEARANCE_KEY = 'desktop_pet_appearance';
// The pet keeps a single long-running conversation. Its id is persisted so the
// same session is reused across pet-window restarts; it only changes when the
// user starts a new one or the current one can no longer be continued (full).
const PET_SESSION_KEY = 'desktop_pet_session_id';
const LEVEL_EXP = 100;
const DEFAULT_PACK_ID = 'plush-lobster';

export const builtInPetResourcePacks: PetResourcePack[] = [
  {
    id: 'plush-lobster',
    name: 'Plush Lobster',
    description: 'Soft red mascot with a compact toy silhouette.',
    status: PetResourcePackStatus.Installed,
    palette: {
      primary: '#f9735b',
      secondary: '#ffd6ca',
      accent: '#15b8a6',
      ink: '#172033',
    },
  },
  {
    id: 'mint-ghost',
    name: 'Mint Ghost',
    description: 'Lightweight floating helper with a calm mint palette.',
    status: PetResourcePackStatus.Installed,
    palette: {
      primary: '#8ee7d0',
      secondary: '#e7fff6',
      accent: '#3b82f6',
      ink: '#15313a',
    },
  },
  {
    id: 'berry-fox',
    name: 'Berry Fox',
    description: 'Warm sticker-style companion for coding sessions.',
    status: PetResourcePackStatus.Installed,
    palette: {
      primary: '#fb7185',
      secondary: '#ffe4e8',
      accent: '#facc15',
      ink: '#2f1720',
    },
  },
  {
    id: 'slate-robot',
    name: 'Slate Robot',
    description: 'Quiet desktop assistant with a small robot body.',
    status: PetResourcePackStatus.Installed,
    palette: {
      primary: '#64748b',
      secondary: '#dbe4ee',
      accent: '#38bdf8',
      ink: '#101827',
    },
  },
];

export const defaultPetState = (): PetState => ({
  pet_level: 1,
  pet_exp: 0,
  pet_energy: 80,
  pet_mood: 'focused',
  task_count: 0,
  token_usage: 0,
  food_count: 2,
  last_rewards: [],
});

export const defaultPetAppearance = (): PetAppearance => ({
  selectedPackId: DEFAULT_PACK_ID,
});

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizePetState = (value: unknown): PetState => {
  if (!value || typeof value !== 'object') {
    return defaultPetState();
  }
  const state = value as Partial<PetState>;
  return {
    ...defaultPetState(),
    ...state,
    pet_level: Math.max(1, Number(state.pet_level) || 1),
    pet_exp: Math.max(0, Number(state.pet_exp) || 0),
    pet_energy: clamp(Number(state.pet_energy) || 0, 0, 100),
    task_count: Math.max(0, Number(state.task_count) || 0),
    token_usage: Math.max(0, Number(state.token_usage) || 0),
    food_count: Math.max(0, Number(state.food_count) || 0),
    last_rewards: Array.isArray(state.last_rewards) ? state.last_rewards.slice(0, 5) : [],
  };
};

const normalizeSpriteConfig = (value: unknown): PetSpriteConfig | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const cfg = value as Partial<PetSpriteConfig>;
  const columns = Math.round(Number(cfg.columns));
  const rows = Math.round(Number(cfg.rows));
  if (!Number.isFinite(columns) || !Number.isFinite(rows) || columns < 1 || rows < 1) {
    return undefined;
  }
  return { columns: clamp(columns, 1, 64), rows: clamp(rows, 1, 64) };
};

const normalizeActions = (
  value: unknown,
  maxFrame: number,
): Partial<Record<PetActionKeyValue, PetActionClip>> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const out: Partial<Record<PetActionKeyValue, PetActionClip>> = {};
  for (const key of PET_ACTION_KEYS) {
    const clip = source[key] as Partial<PetActionClip> | undefined;
    if (!clip || !Array.isArray(clip.frames)) continue;
    const frames = clip.frames
      .map((f) => Math.round(Number(f)))
      .filter((f) => Number.isFinite(f) && f >= 0 && (maxFrame <= 0 || f <= maxFrame));
    if (frames.length === 0) continue;
    out[key] = { frames, fps: clamp(Math.round(Number(clip.fps)) || 4, 1, 30) };
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const normalizePetAppearance = (value: unknown): PetAppearance => {
  if (!value || typeof value !== 'object') {
    return defaultPetAppearance();
  }
  const appearance = value as Partial<PetAppearance>;
  const requestedPackId = typeof appearance.selectedPackId === 'string' ? appearance.selectedPackId : DEFAULT_PACK_ID;
  const selectedPackId = builtInPetResourcePacks.some(pack => pack.id === requestedPackId)
    ? requestedPackId
    : DEFAULT_PACK_ID;
  const sprite = normalizeSpriteConfig(appearance.sprite);
  const maxFrame = sprite ? sprite.columns * sprite.rows - 1 : 0;
  return {
    selectedPackId,
    customName: typeof appearance.customName === 'string' ? appearance.customName : undefined,
    customImageDataUrl: typeof appearance.customImageDataUrl === 'string'
      && appearance.customImageDataUrl.startsWith('data:image/')
      ? appearance.customImageDataUrl
      : undefined,
    sprite,
    actions: normalizeActions(appearance.actions, maxFrame),
  };
};

const levelUp = (state: PetState): PetState => {
  let exp = state.pet_exp;
  let level = state.pet_level;
  while (exp >= LEVEL_EXP) {
    level += 1;
    exp -= LEVEL_EXP;
  }
  return { ...state, pet_level: level, pet_exp: exp };
};

const rewardForSource = (source: PetRewardSourceValue): Omit<PetReward, 'createdAt'> => {
  if (source === PetRewardSource.FileTask) {
    return { source, exp: 24, energyDelta: -12, food: 1, label: 'File task completed' };
  }
  if (source === PetRewardSource.BrowserTask) {
    return { source, exp: 22, energyDelta: -10, food: 1, label: 'Browser task completed' };
  }
  if (source === PetRewardSource.Workflow) {
    return { source, exp: 36, energyDelta: -18, food: 2, label: 'Workflow completed' };
  }
  if (source === PetRewardSource.Helpful) {
    return { source, exp: 18, energyDelta: 0, food: 0, label: 'Helpful answer confirmed' };
  }
  return { source, exp: 8, energyDelta: -3, food: 0, label: 'Chat completed' };
};

export const mapMessageToWorkState = (message: CoworkMessage): AgentWorkStateValue => {
  if (message.type === 'tool_use') {
    const metadata = message.metadata as Record<string, unknown> | undefined;
    const rawTool = String(metadata?.toolName ?? metadata?.name ?? message.content ?? '').toLowerCase();
    if (rawTool.includes('read') || rawTool.includes('pdf') || rawTool.includes('docx')) {
      return AgentWorkState.Reading;
    }
    if (rawTool.includes('write') || rawTool.includes('edit') || rawTool.includes('create')) {
      return AgentWorkState.Writing;
    }
    if (rawTool.includes('browser') || rawTool.includes('web') || rawTool.includes('search')) {
      return AgentWorkState.Browsing;
    }
    if (rawTool.includes('exec') || rawTool.includes('terminal') || rawTool.includes('shell')) {
      return AgentWorkState.Executing;
    }
    return AgentWorkState.Executing;
  }
  if (message.type === 'assistant') {
    return AgentWorkState.Thinking;
  }
  if (message.type === 'user') {
    return AgentWorkState.Listening;
  }
  return AgentWorkState.Executing;
};

export const inferRewardSource = (messages: CoworkMessage[]): PetRewardSourceValue => {
  const text = messages
    .map((message) => `${message.type} ${message.content} ${JSON.stringify(message.metadata ?? {})}`)
    .join(' ')
    .toLowerCase();
  if (text.includes('browser') || text.includes('web') || text.includes('search') || text.includes('http')) {
    return PetRewardSource.BrowserTask;
  }
  if (text.includes('file') || text.includes('pdf') || text.includes('docx') || text.includes('xlsx') || text.includes('ppt')) {
    return PetRewardSource.FileTask;
  }
  if (text.includes('tool_use') || text.includes('tool_result')) {
    return PetRewardSource.Workflow;
  }
  return PetRewardSource.Chat;
};

class PetService {
  getDefaultPetModelId(): string {
    return DEFAULT_PET_MODEL_ID;
  }

  getDefaultPetModelSource(): string {
    return DEFAULT_PET_MODEL_SPRITESHEET_URL;
  }

  async loadDefaultPetModelImage(): Promise<string> {
    if (!defaultPetModelImagePromise) {
      defaultPetModelImagePromise = window.electron.pet.getModelImage()
        .then((result) => {
          if (!result.success || !result.dataUrl) {
            throw new Error(result.error || 'Failed to read pet model image.');
          }
          return result.dataUrl;
        })
        .catch((error) => {
          defaultPetModelImagePromise = null;
          throw error;
        });
    }
    return defaultPetModelImagePromise;
  }

  getResourcePacks(): PetResourcePack[] {
    return builtInPetResourcePacks;
  }

  /**
   * Resolve the sprite the pet window should animate: a user-uploaded sheet when
   * one is configured, otherwise the bundled Peach model. Falls back to the Peach
   * default if a custom sheet is selected but lacks a grid config.
   */
  async resolveSpriteSource(): Promise<PetSpriteSource> {
    const appearance = await this.getAppearance().catch(() => defaultPetAppearance());
    if (appearance.customImageDataUrl && appearance.sprite) {
      return {
        imageUrl: appearance.customImageDataUrl,
        columns: appearance.sprite.columns,
        rows: appearance.sprite.rows,
        actions: { ...DEFAULT_PET_ACTIONS, ...(appearance.actions ?? {}) },
      };
    }
    const imageUrl = await this.loadDefaultPetModelImage();
    return {
      imageUrl,
      columns: DEFAULT_PET_MODEL_COLUMNS,
      rows: DEFAULT_PET_MODEL_ROWS,
      actions: DEFAULT_PET_ACTIONS,
    };
  }

  async getAppearance(): Promise<PetAppearance> {
    const stored = await window.electron.store.get(PET_APPEARANCE_KEY);
    return normalizePetAppearance(stored);
  }

  async setAppearance(appearance: PetAppearance): Promise<PetAppearance> {
    const normalized = normalizePetAppearance(appearance);
    await window.electron.store.set(PET_APPEARANCE_KEY, normalized);
    return normalized;
  }

  /**
   * Record the selected built-in pack. Deliberately does NOT clear a custom
   * upload: packs are cosmetic metadata that the renderer does not consume yet,
   * so wiping the user's spritesheet here silently reset them to default Peach.
   * Use clearCustomImage() when the user explicitly wants the default back.
   */
  async selectResourcePack(packId: string): Promise<PetAppearance> {
    const current = await this.getAppearance();
    return this.setAppearance({
      ...current,
      selectedPackId: builtInPetResourcePacks.some(pack => pack.id === packId) ? packId : DEFAULT_PACK_ID,
    });
  }

  async setCustomImage(
    dataUrl: string,
    name: string,
    sprite?: PetSpriteConfig,
    actions?: Partial<Record<PetActionKeyValue, PetActionClip>>,
  ): Promise<PetAppearance> {
    const current = await this.getAppearance();
    return this.setAppearance({
      ...current,
      customImageDataUrl: dataUrl,
      customName: name,
      sprite,
      actions,
    });
  }

  async clearCustomImage(): Promise<PetAppearance> {
    const current = await this.getAppearance();
    return this.setAppearance({
      ...current,
      customImageDataUrl: undefined,
      customName: undefined,
      sprite: undefined,
      actions: undefined,
    });
  }

  async getState(): Promise<PetState> {
    const stored = await window.electron.store.get(PET_STATE_KEY);
    return normalizePetState(stored);
  }

  /** The persisted id of the pet's shared conversation, or null if none yet. */
  async getPersistedSessionId(): Promise<string | null> {
    const stored = await window.electron.store.get(PET_SESSION_KEY);
    return typeof stored === 'string' && stored ? stored : null;
  }

  /** Remember the pet's shared conversation so it survives window restarts. */
  async setPersistedSessionId(sessionId: string): Promise<void> {
    if (sessionId) {
      await window.electron.store.set(PET_SESSION_KEY, sessionId);
    }
  }

  /** Forget the shared conversation so the next message opens a fresh session. */
  async clearPersistedSessionId(): Promise<void> {
    await window.electron.store.remove(PET_SESSION_KEY);
  }

  async setState(state: PetState): Promise<PetState> {
    const normalized = normalizePetState(state);
    await window.electron.store.set(PET_STATE_KEY, normalized);
    return normalized;
  }

  async addTaskReward(source: PetRewardSourceValue, tokenUsage = 0): Promise<PetState> {
    const state = await this.getState();
    const reward = { ...rewardForSource(source), createdAt: Date.now() };
    const next = levelUp({
      ...state,
      pet_exp: state.pet_exp + reward.exp,
      pet_energy: clamp(state.pet_energy + reward.energyDelta, 0, 100),
      pet_mood: state.pet_energy + reward.energyDelta < 30 ? 'tired' : 'happy',
      task_count: state.task_count + 1,
      token_usage: state.token_usage + Math.max(0, tokenUsage),
      food_count: state.food_count + reward.food,
      last_rewards: [reward, ...state.last_rewards].slice(0, 5),
    });
    return this.setState(next);
  }

  async feed(): Promise<PetState> {
    const state = await this.getState();
    if (state.food_count <= 0) {
      return state;
    }
    return this.setState({
      ...state,
      food_count: state.food_count - 1,
      pet_energy: clamp(state.pet_energy + 25, 0, 100),
      pet_mood: 'happy',
    });
  }

  getPlatformPlan(): PlatformModelPlan {
    return {
      providerName: 'PlatformModelProvider',
      currentPlan: 'Demo',
      remainingQuota: 100000,
      dailyUsage: 0,
      taskUsage: 0,
    };
  }
}

export const petService = new PetService();