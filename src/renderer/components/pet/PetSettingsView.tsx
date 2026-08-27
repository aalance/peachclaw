import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type PetActionClip,
  type PetActionKey,
  type PetAppearance,
  type PetState,
} from '../../../shared/pet/constants';
import {
  MOSS_PRESET_VOICES,
  MOSS_PROMPT_AUDIO_EXTENSIONS,
} from '../../../shared/tts/constants';
import { i18nService } from '../../services/i18n';
import {
  DEFAULT_PET_ACTIONS,
  defaultPetAppearance,
  defaultPetState,
  petService,
} from '../../services/pet';
import {
  convertToReferenceWavBase64,
  dataUrlToArrayBuffer,
} from '../../services/referenceAudio';
import {
  defaultVoiceSettings,
  ttsService,
  type TTSVoiceOption,
  type VoiceSettings,
} from '../../services/tts';
import ComposeIcon from '../icons/ComposeIcon';
import SidebarToggleIcon from '../icons/SidebarToggleIcon';
import WindowTitleBar from '../window/WindowTitleBar';

interface PetSettingsViewProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onNewChat?: () => void;
  updateBadge?: React.ReactNode;
}

// levelUp() in pet.ts keeps pet_exp within [0, LEVEL_EXP); mirror the constant for the bar.
const LEVEL_EXP = 100;

const ACTION_ORDER: PetActionKey[] = ['idle', 'run', 'listen', 'talk', 'think', 'wave'];
const actionLabelKey: Record<PetActionKey, string> = {
  idle: 'petActionIdle',
  run: 'petActionRun',
  listen: 'petActionListen',
  talk: 'petActionTalk',
  think: 'petActionThink',
  wave: 'petActionWave',
};

const moodLabelKey: Record<PetState['pet_mood'], string> = {
  happy: 'petMoodHappy',
  focused: 'petMoodFocused',
  tired: 'petMoodTired',
};

const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
};

const parseFrames = (text: string): number[] =>
  text
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .map((n) => Math.round(n));

type ActionForm = Record<PetActionKey, { frames: string; fps: number }>;

const actionsToForm = (actions?: Partial<Record<PetActionKey, PetActionClip>>): ActionForm => {
  const form = {} as ActionForm;
  for (const key of ACTION_ORDER) {
    const clip = actions?.[key] ?? DEFAULT_PET_ACTIONS[key];
    form[key] = { frames: clip.frames.join(', '), fps: clip.fps };
  }
  return form;
};

const StatCard: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-xl border border-border bg-surface-raised px-4 py-3">
    <div className="text-xs text-secondary">{label}</div>
    <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
  </div>
);

const PetSettingsView: React.FC<PetSettingsViewProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewChat,
  updateBadge,
}) => {
  const isMac = window.electron.platform === 'darwin';
  const [petState, setPetState] = useState<PetState>(defaultPetState);
  const [appearance, setAppearance] = useState<PetAppearance>(defaultPetAppearance);
  const [visible, setVisible] = useState(true);

  // Voice (text-to-speech) settings
  const [voice, setVoice] = useState<VoiceSettings>(defaultVoiceSettings);
  const [voiceOptions, setVoiceOptions] = useState<TTSVoiceOption[]>([]);
  // Transient status shown next to the MOSS "test connection" / preview buttons.
  const [mossStatus, setMossStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Custom-upload form state
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [columns, setColumns] = useState(8);
  const [rows, setRows] = useState(9);
  const [actionForm, setActionForm] = useState<ActionForm>(() => actionsToForm());
  const [fileName, setFileName] = useState('custom');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reloadState = useCallback(async () => {
    const [state, appear] = await Promise.all([
      petService.getState(),
      petService.getAppearance(),
    ]);
    setPetState(state);
    setAppearance(appear);
    if (appear.customImageDataUrl) {
      setDataUrl(appear.customImageDataUrl);
      if (appear.sprite) {
        setColumns(appear.sprite.columns);
        setRows(appear.sprite.rows);
      }
      setActionForm(actionsToForm(appear.actions));
      setFileName(appear.customName || 'custom');
    }
  }, []);

  useEffect(() => {
    void reloadState();
    void window.electron.pet.getVisible().then((s) => setVisible(s.visible)).catch(() => undefined);
    void ttsService.getSettings().then(setVoice).catch(() => undefined);
    void ttsService.listVoices().then(setVoiceOptions).catch(() => undefined);
    const unsub = window.electron.pet.onVisibilityChanged(({ visible: v }) => setVisible(v));
    return unsub;
  }, [reloadState]);

  // Measure the natural dimensions of the loaded sprite for the grid overlay.
  useEffect(() => {
    if (!dataUrl) { setImageSize(null); return; }
    const img = new Image();
    img.onload = () => setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = dataUrl;
  }, [dataUrl]);

  const toast = (message: string) =>
    window.dispatchEvent(new CustomEvent('app:showToast', { detail: message }));

  const handleToggleVisible = async () => {
    const next = !visible;
    setVisible(next);
    try {
      const result = await window.electron.pet.setVisible(next);
      setVisible(result.visible);
    } catch {
      setVisible(!next);
    }
  };

  const persistVoice = async (next: VoiceSettings) => {
    setVoice(next);
    try {
      const saved = await ttsService.setSettings(next);
      setVoice(saved);
    } catch {
      // keep the optimistic value if persistence fails
    }
  };

  const handleToggleVoice = () => {
    const next = { ...voice, enabled: !voice.enabled };
    if (!next.enabled) ttsService.stop();
    void persistVoice(next);
  };

  const handlePreviewVoice = () => {
    setMossStatus(null);
    ttsService.preview(i18nService.t('petVoicePreviewText'), voice, {
      onError: (err) =>
        setMossStatus({ kind: 'error', text: `${i18nService.t('petVoiceMossError')}: ${String(err)}` }),
    });
  };

  // Patch a single MOSS config field and persist. Clears any stale test status.
  const updateMoss = (patch: Partial<VoiceSettings['moss']>) => {
    setMossStatus(null);
    void persistVoice({ ...voice, moss: { ...voice.moss, ...patch } });
  };

  // Pick a recording to clone. MOSS only reads WAV, while phone and chat-app
  // recordings are almost always MP3/M4A, so the file is decoded and re-encoded
  // to a trimmed mono WAV before it is stored.
  const handlePickPromptAudio = async () => {
    try {
      const picked = await window.electron.dialog.selectFile({
        title: i18nService.t('petVoiceMossPickAudio'),
        filters: [{ name: 'Audio', extensions: MOSS_PROMPT_AUDIO_EXTENSIONS }],
      });
      if (!picked?.success || !picked.path) return;

      setMossStatus({ kind: 'ok', text: i18nService.t('petVoiceMossConverting') });
      const read = await window.electron.dialog.readFileAsDataUrl(picked.path);
      if (!read?.success || !read.dataUrl) {
        throw new Error(read?.error || 'cannot read the file');
      }
      const wavBase64 = await convertToReferenceWavBase64(dataUrlToArrayBuffer(read.dataUrl));
      const saved = await window.electron.tts.savePromptAudio(wavBase64);
      if (!saved?.ok || !saved.path) throw new Error(saved?.error || 'cannot save the recording');

      updateMoss({ promptAudioPath: saved.path });
      setMossStatus({ kind: 'ok', text: i18nService.t('petVoiceMossAudioReady') });
    } catch (err) {
      setMossStatus({ kind: 'error', text: `${i18nService.t('petVoiceMossError')}: ${String(err)}` });
    }
  };

  const handleTestMoss = async () => {    setMossStatus({ kind: 'ok', text: i18nService.t('petVoiceMossTesting') });
    try {
      const res = await window.electron.tts.ping(voice.moss);
      if (res.ok) {
        setMossStatus({ kind: 'ok', text: i18nService.t('petVoiceMossTestOk') });
      } else {
        setMossStatus({ kind: 'error', text: `${i18nService.t('petVoiceMossError')}: ${res.error ?? ''}` });
      }
    } catch (err) {
      setMossStatus({ kind: 'error', text: `${i18nService.t('petVoiceMossError')}: ${String(err)}` });
    }
  };

  // handleSelectPack removed with the built-in pack grid — see the comment in the
  // Appearance section. petService.selectResourcePack() is kept for when packs land.

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDataUrl(reader.result);
        setFileName(file.name.replace(/\.[^.]+$/, '') || 'custom');
      }
    };
    reader.readAsDataURL(file);
  };

  const updateAction = (key: PetActionKey, patch: Partial<{ frames: string; fps: number }>) => {
    setActionForm((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const handleSaveCustom = async () => {
    if (!dataUrl) return;
    const actions: Partial<Record<PetActionKey, PetActionClip>> = {};
    for (const key of ACTION_ORDER) {
      const frames = parseFrames(actionForm[key].frames);
      if (frames.length > 0) {
        actions[key] = { frames, fps: Math.max(1, Math.min(30, Math.round(actionForm[key].fps) || 4)) };
      }
    }
    const next = await petService.setCustomImage(
      dataUrl,
      fileName,
      { columns: Math.max(1, columns), rows: Math.max(1, rows) },
      actions,
    );
    setAppearance(next);
    await window.electron.pet.notifyAppearanceChanged().catch(() => undefined);
    toast(i18nService.t('petApplied'));
  };

  const handleResetCustom = async () => {
    const next = await petService.clearCustomImage();
    setAppearance(next);
    setDataUrl(null);
    setColumns(8);
    setRows(9);
    setActionForm(actionsToForm());
    await window.electron.pet.notifyAppearanceChanged().catch(() => undefined);
    toast(i18nService.t('petApplied'));
  };

  const gridCells = useMemo(() => {
    const total = Math.max(1, columns * rows);
    return Array.from({ length: Math.min(total, 256) }, (_, i) => i);
  }, [columns, rows]);

  const previewWidth = 360;
  const previewHeight = imageSize ? Math.round((imageSize.h / imageSize.w) * previewWidth) : 0;

  const expPct = Math.min(100, Math.round((petState.pet_exp / LEVEL_EXP) * 100));

  return (
    <div className="flex-1 flex flex-col bg-background h-full">
      <div className="draggable flex h-12 items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center space-x-3 h-8">
          {isSidebarCollapsed && (
            <div className={`non-draggable flex items-center gap-1 ${isMac ? 'pl-[68px]' : ''}`}>
              <button
                type="button"
                onClick={onToggleSidebar}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                <SidebarToggleIcon className="h-4 w-4" isCollapsed={true} />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-secondary hover:bg-surface-raised transition-colors"
              >
                <ComposeIcon className="h-4 w-4" />
              </button>
              {updateBadge}
            </div>
          )}
          <h1 className="text-lg font-semibold text-foreground">{i18nService.t('petPageTitle')}</h1>
        </div>
        <WindowTitleBar inline />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
          <p className="text-sm text-secondary">{i18nService.t('petPageSubtitle')}</p>

          {/* Display toggle */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">{i18nService.t('petSectionDisplay')}</h2>
            <label className="flex items-center justify-between rounded-xl border border-border bg-surface-raised px-4 py-3 cursor-pointer">
              <span className="text-sm text-foreground">{i18nService.t('petVisibleLabel')}</span>
              <button
                type="button"
                onClick={() => void handleToggleVisible()}
                className={`relative h-6 w-11 rounded-full transition-colors ${visible ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                aria-pressed={visible}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${visible ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </label>
          </section>

          {/* Voice (text-to-speech) */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">{i18nService.t('petSectionVoice')}</h2>
            <label className="flex items-center justify-between rounded-xl border border-border bg-surface-raised px-4 py-3 cursor-pointer">
              <span className="text-sm text-foreground">{i18nService.t('petVoiceEnableLabel')}</span>
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`relative h-6 w-11 rounded-full transition-colors ${voice.enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                aria-pressed={voice.enabled}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${voice.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </label>

            {voice.enabled && (
              <div className="mt-3 space-y-4 rounded-xl border border-border bg-surface-raised px-4 py-3">
                {/* Engine selector: system OS voice vs local MOSS-TTS-Nano server */}
                <label className="block">
                  <span className="text-xs text-secondary">{i18nService.t('petVoiceEngineLabel')}</span>
                  <select
                    value={voice.engine === 'moss' ? 'moss' : 'system'}
                    onChange={(e) => {
                      setMossStatus(null);
                      void persistVoice({ ...voice, engine: e.target.value === 'moss' ? 'moss' : 'system' });
                    }}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  >
                    <option value="system">{i18nService.t('petVoiceEngineSystem')}</option>
                    <option value="moss">{i18nService.t('petVoiceEngineMoss')}</option>
                  </select>
                </label>

                {/* System engine: OS voice picker */}
                {voice.engine === 'system' && (
                  <label className="block">
                    <span className="text-xs text-secondary">{i18nService.t('petVoiceSelectLabel')}</span>
                    <select
                      value={voice.voiceURI ?? ''}
                      onChange={(e) => void persistVoice({ ...voice, voiceURI: e.target.value || null })}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                    >
                      <option value="">{i18nService.t('petVoiceSystemDefault')}</option>
                      {voiceOptions.map((opt) => (
                        <option key={opt.uri} value={opt.uri}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                )}

                {/* MOSS engine: local server config */}
                {voice.engine === 'moss' && (
                  <div className="space-y-3">
                    <p className="text-xs text-secondary">{i18nService.t('petVoiceMossHint')}</p>
                    <label className="block">
                      <span className="text-xs text-secondary">{i18nService.t('petVoiceMossServerUrl')}</span>
                      <input
                        type="text"
                        value={voice.moss.baseUrl}
                        onChange={(e) => updateMoss({ baseUrl: e.target.value })}
                        placeholder="http://127.0.0.1:18083"
                        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-secondary">{i18nService.t('petVoiceMossVoice')}</span>
                      <select
                        value={voice.moss.promptAudioPath ? '__custom__' : voice.moss.demoId}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') void handlePickPromptAudio();
                          else updateMoss({ demoId: e.target.value, promptAudioPath: '' });
                        }}
                        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                      >
                        {MOSS_PRESET_VOICES.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {i18nService.getLanguage() === 'en' ? preset.labelEn : preset.labelZh}
                          </option>
                        ))}
                        <option value="__custom__">{i18nService.t('petVoiceMossCustom')}</option>
                      </select>
                    </label>
                    {voice.moss.promptAudioPath && (
                      <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                        <span className="truncate text-xs text-foreground">
                          {i18nService.t('petVoiceMossAudioReady')}
                        </span>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => void handlePickPromptAudio()}
                            className="text-xs text-primary hover:underline"
                          >
                            {i18nService.t('petVoiceMossReplaceAudio')}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateMoss({ promptAudioPath: '' })}
                            className="text-xs text-secondary hover:underline"
                          >
                            {i18nService.t('petVoiceMossClearAudio')}
                          </button>
                        </div>
                      </div>
                    )}
                    {voice.moss.promptAudioPath && (
                      <p className="text-[11px] text-secondary opacity-70">
                        {i18nService.t('petVoiceMossCustomHint')}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleTestMoss()}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background transition-colors"
                    >
                      {i18nService.t('petVoiceMossTest')}
                    </button>
                    {/* Reading a long reply in full stalls between sentences on a
                        slower-than-realtime model, so this is opt-in. */}
                    <label className="flex items-start justify-between gap-3 pt-1 cursor-pointer">
                      <span className="text-xs text-secondary">
                        {i18nService.t('petVoiceMossFullLabel')}
                        <span className="mt-0.5 block text-[11px] opacity-70">
                          {i18nService.t('petVoiceMossFullHint')}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateMoss({ scope: voice.moss.scope === 'full' ? 'brief' : 'full' })
                        }
                        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${voice.moss.scope === 'full' ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
                        aria-pressed={voice.moss.scope === 'full'}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${voice.moss.scope === 'full' ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                      </button>
                    </label>
                  </div>
                )}

                {/* Rate / Pitch / Volume sliders */}
                <label className="block">
                  <div className="flex items-center justify-between text-xs text-secondary">
                    <span>{i18nService.t('petVoiceRate')}</span>
                    <span>{voice.rate.toFixed(1)}×</span>
                  </div>
                  <input
                    type="range" min={0.5} max={2} step={0.1} value={voice.rate}
                    onChange={(e) => setVoice((v) => ({ ...v, rate: Number(e.target.value) }))}
                    onMouseUp={() => void persistVoice(voice)}
                    onTouchEnd={() => void persistVoice(voice)}
                    className="mt-1 w-full accent-primary"
                  />
                </label>
                {/* Pitch is a system-voice control; MOSS has no pitch parameter. */}
                {voice.engine !== 'moss' && (
                  <label className="block">
                    <div className="flex items-center justify-between text-xs text-secondary">
                      <span>{i18nService.t('petVoicePitch')}</span>
                      <span>{voice.pitch.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min={0} max={2} step={0.1} value={voice.pitch}
                      onChange={(e) => setVoice((v) => ({ ...v, pitch: Number(e.target.value) }))}
                      onMouseUp={() => void persistVoice(voice)}
                      onTouchEnd={() => void persistVoice(voice)}
                      className="mt-1 w-full accent-primary"
                    />
                  </label>
                )}
                <label className="block">
                  <div className="flex items-center justify-between text-xs text-secondary">
                    <span>{i18nService.t('petVoiceVolume')}</span>
                    <span>{Math.round(voice.volume * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.05} value={voice.volume}
                    onChange={(e) => setVoice((v) => ({ ...v, volume: Number(e.target.value) }))}
                    onMouseUp={() => void persistVoice(voice)}
                    onTouchEnd={() => void persistVoice(voice)}
                    className="mt-1 w-full accent-primary"
                  />
                </label>

                <button
                  type="button"
                  onClick={handlePreviewVoice}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background transition-colors"
                >
                  {i18nService.t('petVoicePreview')}
                </button>
                {mossStatus && (
                  <p className={`text-xs ${mossStatus.kind === 'error' ? 'text-red-500' : 'text-secondary'}`}>
                    {mossStatus.text}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Stats dashboard */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">{i18nService.t('petSectionStats')}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label={i18nService.t('petLevel')} value={`Lv.${petState.pet_level}`} />
              <StatCard label={i18nService.t('petTokenUsage')} value={formatNumber(petState.token_usage)} />
              <StatCard label={i18nService.t('petTaskCount')} value={petState.task_count} />
              <StatCard label={i18nService.t('petMood')} value={i18nService.t(moodLabelKey[petState.pet_mood])} />
            </div>
            <div className="mt-3 rounded-xl border border-border bg-surface-raised px-4 py-3">
              <div className="flex items-center justify-between text-xs text-secondary">
                <span>{i18nService.t('petExp')}</span>
                <span>{petState.pet_exp} / {LEVEL_EXP}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${expPct}%` }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-secondary">
                <span>{i18nService.t('petEnergy')}</span>
                <span>{petState.pet_energy} / 100</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${petState.pet_energy}%` }} />
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-surface-raised px-4 py-3">
              <div className="text-xs text-secondary">{i18nService.t('petRecentRewards')}</div>
              {petState.last_rewards.length === 0 ? (
                <div className="mt-2 text-xs text-secondary">{i18nService.t('petNoRewards')}</div>
              ) : (
                <ul className="mt-2 space-y-1">
                  {petState.last_rewards.map((r, i) => (
                    <li key={i} className="flex items-center justify-between text-sm text-foreground">
                      <span className="truncate">{r.label}</span>
                      <span className="shrink-0 text-xs text-primary">+{r.exp} EXP</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Appearance */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-foreground">{i18nService.t('petSectionAppearance')}</h2>

            {/*
              Built-in resource packs are hidden until they actually render.
              petService.resolveSpriteSource() ignores appearance.selectedPackId
              and resources/pets/ only ships the "peach" spritesheet, so picking a
              pack changed the swatch highlight and nothing else. Restore this
              block once packs have real spritesheets or palette tinting.
            */}

            {/* Custom upload */}
            <div className="mt-5 rounded-xl border border-border bg-surface-raised p-4">
              <div className="text-sm font-medium text-foreground">{i18nService.t('petCustomUpload')}</div>
              <p className="mt-1 text-xs text-secondary">{i18nService.t('petUploadHint')}</p>

              <div className="mt-3 flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/webp,image/jpeg,image/gif"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background transition-colors"
                >
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  {i18nService.t('petUploadButton')}
                </button>
                {appearance.customImageDataUrl && (
                  <button
                    type="button"
                    onClick={() => void handleResetCustom()}
                    className="text-sm text-secondary hover:text-foreground"
                  >
                    {i18nService.t('petReset')}
                  </button>
                )}
              </div>

              {dataUrl && (
                <>
                  {/* Grid overlay preview */}
                  <div className="mt-4 inline-block rounded-lg border border-border bg-background p-2">
                    <div className="relative" style={{ width: previewWidth, height: previewHeight }}>
                      <img src={dataUrl} alt="" className="absolute inset-0 h-full w-full object-fill" />
                      <div
                        className="absolute inset-0 grid"
                        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
                      >
                        {gridCells.map((idx) => (
                          <div key={idx} className="border border-primary/30 text-[9px] leading-none text-primary/80 flex items-start justify-start p-0.5">
                            {idx}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Grid config */}
                  <div className="mt-3 flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      {i18nService.t('petColumns')}
                      <input
                        type="number" min={1} max={64} value={columns}
                        onChange={(e) => setColumns(Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      {i18nService.t('petRows')}
                      <input
                        type="number" min={1} max={64} value={rows}
                        onChange={(e) => setRows(Math.max(1, Number(e.target.value) || 1))}
                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                      />
                    </label>
                  </div>

                  {/* Per-action frame pickers */}
                  <div className="mt-4 space-y-2">
                    {ACTION_ORDER.map((key) => (
                      <div key={key} className="flex flex-wrap items-center gap-2">
                        <span className="w-32 shrink-0 text-sm text-foreground">{i18nService.t(actionLabelKey[key])}</span>
                        <input
                          type="text"
                          value={actionForm[key].frames}
                          onChange={(e) => updateAction(key, { frames: e.target.value })}
                          placeholder={i18nService.t('petFramesLabel')}
                          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
                        />
                        <label className="flex items-center gap-1 text-xs text-secondary">
                          {i18nService.t('petFpsLabel')}
                          <input
                            type="number" min={1} max={30} value={actionForm[key].fps}
                            onChange={(e) => updateAction(key, { fps: Number(e.target.value) || 1 })}
                            className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm"
                          />
                        </label>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => void handleSaveCustom()}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
                    >
                      {i18nService.t('petSave')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PetSettingsView;
