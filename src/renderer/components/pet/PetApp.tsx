import {
  ChatBubbleOvalLeftIcon,
  ClockIcon,
  PaperAirplaneIcon,
  PlusIcon,
  WindowIcon,
} from '@heroicons/react/24/outline';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  AgentWorkState,
  type AgentWorkState as AgentWorkStateValue,
  type PetActionKey as PetActionKeyValue,
  type PetState,
} from '../../../shared/pet/constants';
import {
  actionForWorkState,
  inferRewardSource,
  mapMessageToWorkState,
  petService,
  type PetSpriteSource,
} from '../../services/pet';
import { ttsService } from '../../services/tts';
import type { CoworkMessage, CoworkSessionSummary } from '../../types/cowork';

const stateLabels: Record<AgentWorkStateValue, string> = {
  [AgentWorkState.Idle]: '待机中',
  [AgentWorkState.Listening]: '正在听你说',
  [AgentWorkState.Thinking]: '正在思考',
  [AgentWorkState.Planning]: '正在规划',
  [AgentWorkState.WaitingApproval]: '等待确认',
  [AgentWorkState.Reading]: '正在读文件',
  [AgentWorkState.Writing]: '正在写内容',
  [AgentWorkState.Browsing]: '正在浏览网页',
  [AgentWorkState.Coding]: '正在写代码',
  [AgentWorkState.Executing]: '正在执行任务',
  [AgentWorkState.Completed]: '任务完成',
  [AgentWorkState.Failed]: '任务失败',
};

const WELCOME = '我在这里，可以聊天，也可以帮你处理电脑任务。';

/**
 * Animated sprite for the desktop pet. Loads the resolved sprite sheet (custom
 * upload or the bundled Peach model) and steps through the frames of the clip
 * matching the current action.
 */
const PetSprite: React.FC<{
  action: PetActionKeyValue;
  onMouseDown?: (event: React.MouseEvent) => void;
}> = ({ action, onMouseDown }) => {
  const [source, setSource] = useState<PetSpriteSource | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);

  const loadSource = useCallback(() => {
    petService
      .resolveSpriteSource()
      .then(setSource)
      .catch(() => setSource(null));
  }, []);

  useEffect(() => {
    loadSource();
    const unsubscribe = window.electron.pet.onAppearanceChanged(loadSource);
    return unsubscribe;
  }, [loadSource]);

  const clip = source ? source.actions[action] ?? source.actions.idle : undefined;

  // Restart the clip whenever the action changes.
  useEffect(() => {
    setFrameIndex(0);
  }, [action]);

  useEffect(() => {
    if (!clip || clip.frames.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % clip.frames.length);
    }, Math.max(1000 / clip.fps, 40));
    return () => window.clearInterval(interval);
  }, [clip]);

  if (!source || !clip) {
    return <div className="pet-sprite pet-sprite-loading" onMouseDown={onMouseDown} />;
  }

  const frame = clip.frames[frameIndex % clip.frames.length] ?? clip.frames[0] ?? 0;
  const col = frame % source.columns;
  const row = Math.floor(frame / source.columns);
  const posX = source.columns > 1 ? (col / (source.columns - 1)) * 100 : 0;
  const posY = source.rows > 1 ? (row / (source.rows - 1)) * 100 : 0;

  return (
    <div
      className="pet-sprite"
      onMouseDown={onMouseDown}
      style={{
        backgroundImage: `url(${source.imageUrl})`,
        backgroundSize: `${source.columns * 100}% ${source.rows * 100}%`,
        backgroundPosition: `${posX}% ${posY}%`,
      }}
    />
  );
};

const PetApp: React.FC = () => {
  const [workState, setWorkState] = useState<AgentWorkStateValue>(AgentWorkState.Idle);
  const [petState, setPetState] = useState<PetState | null>(null);
  const [prompt, setPrompt] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [petOutput, setPetOutput] = useState(WELCOME);
  const [chatVisible, setChatVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySessions, setHistorySessions] = useState<CoworkSessionSummary[]>([]);
  const [isTalking, setIsTalking] = useState(false);
  const [recentMessages, setRecentMessages] = useState<CoworkMessage[]>([]);

  const idleTimerRef = useRef<number | null>(null);
  const talkTimerRef = useRef<number | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  // Latest non-thinking assistant text of the current turn; spoken once the turn
  // completes so the audio matches the reply the bubble ends up showing.
  const latestReplyRef = useRef('');
  const draggingRef = useRef(false);

  // Drag the pet by its body. The sprite can't use -webkit-app-region:drag (it
  // would block the hover menu), so we move the window via IPC instead.
  const handleSpriteMouseDown = useCallback((event: React.MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    draggingRef.current = true;
    window.electron.pet.dragStart();
    const onMove = () => {
      if (draggingRef.current) window.electron.pet.dragMove();
    };
    const onUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const scheduleIdle = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => {
      setWorkState(AgentWorkState.Idle);
    }, 5000);
  }, [clearIdleTimer]);

  // Briefly play the "talk" pose while assistant text is streaming in.
  const flagTalking = useCallback(() => {
    setIsTalking(true);
    if (talkTimerRef.current) window.clearTimeout(talkTimerRef.current);
    talkTimerRef.current = window.setTimeout(() => setIsTalking(false), 900);
  }, []);

  // Read a finished reply aloud (no-op unless the user enabled voice). While the
  // pet is actually speaking we hold the "talk" pose for the whole utterance
  // instead of the fixed 900ms blip, so the mouth animation matches the audio.
  const speakReply = useCallback((text: string) => {
    void ttsService.speak(text, {
      onStart: () => {
        if (talkTimerRef.current) window.clearTimeout(talkTimerRef.current);
        setIsTalking(true);
      },
      onEnd: () => setIsTalking(false),
      // Without this a failing MOSS server just leaves the pet mute with no clue
      // why, which is exactly how a broken reference recording presented.
      onError: (err) => console.error('[PetVoice] speech failed:', err),
    });
  }, []);

  // Keep the menu open while the cursor is anywhere over the pet's halo; close
  // it shortly after the cursor leaves so brief gaps don't make it flicker.
  const openMenu = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setMenuOpen(true);
  }, []);

  const scheduleCloseMenu = useCallback(() => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false);
      setHistoryOpen(false);
    }, 260);
  }, []);

  useEffect(() => {
    let mounted = true;
    petService.getState().then((state) => {
      if (mounted) setPetState(state);
    });
    // Resume the pet's shared conversation from the last run, if any.
    petService.getPersistedSessionId().then((id) => {
      if (mounted && id) setSessionId(id);
    });
    return () => {
      mounted = false;
      clearIdleTimer();
      ttsService.stop();
      if (talkTimerRef.current) window.clearTimeout(talkTimerRef.current);
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    };
  }, [clearIdleTimer]);

  useEffect(() => {
    const cleanups = [
      window.electron.cowork.onStreamMessage(({ message }) => {
        setRecentMessages((messages) => [message, ...messages].slice(0, 20));
        const nextState = mapMessageToWorkState(message);
        setWorkState(nextState);
        // The bubble only ever shows the pet's own output, never the user prompt.
        if (message.type === 'assistant' && message.content.trim()) {
          const reply = message.content.trim();
          setPetOutput(reply);
          flagTalking();
          // Reasoning traces arrive as assistant messages too — skip them the
          // same way imReplyGuard does, or the pet would read the model's
          // thinking (which restates the prompt and mixes languages).
          if (!message.metadata?.isThinking) latestReplyRef.current = reply;
        }
      }),
      window.electron.cowork.onStreamMessageUpdate(({ content, metadata }) => {
        if (content.trim()) {
          setWorkState(AgentWorkState.Thinking);
          setPetOutput(content.trim());
          flagTalking();
          if (metadata?.isThinking !== true) latestReplyRef.current = content.trim();
        }
      }),
      window.electron.cowork.onStreamPermission(({ request }) => {
        setWorkState(AgentWorkState.WaitingApproval);
        setPetOutput(`需要确认：${request.toolName}`);
      }),
      window.electron.cowork.onStreamComplete(async () => {
        setWorkState(AgentWorkState.Completed);
        // Speak only once the turn is finished, using the same text the bubble
        // ended up showing. The first assistant message carries just the opening
        // of a streamed reply, so speaking it read a greeting instead of the
        // actual answer.
        const finalReply = latestReplyRef.current;
        latestReplyRef.current = '';
        if (finalReply) speakReply(finalReply);
        const source = inferRewardSource(recentMessages);
        const next = await petService.addTaskReward(source);
        setPetState(next);
        scheduleIdle();
      }),
      window.electron.cowork.onStreamError(({ error }) => {
        ttsService.stop();
        latestReplyRef.current = '';
        setWorkState(AgentWorkState.Failed);
        setPetOutput(error || '任务遇到问题了。');
        scheduleIdle();
      }),
    ];

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [recentMessages, scheduleIdle, flagTalking, speakReply]);

  const action = isTalking ? 'talk' : actionForWorkState(workState);

  const sendPrompt = useCallback(async () => {
    const text = prompt.trim();
    if (!text) return;

    // Cut off any reply the pet is still speaking before starting a new turn.
    ttsService.stop();
    setIsTalking(false);
    latestReplyRef.current = '';

    setPrompt('');
    setWorkState(AgentWorkState.Thinking);
    setPetOutput('收到，我开始处理。');
    const roleContext = [
      '你是 AI 桌宠和 OpenClaw 桌面 Agent 的统一身份。',
      `当前桌宠状态：${workState}。`,
      petState ? `亲密成长：等级 ${petState.pet_level}，精力 ${petState.pet_energy}。` : '',
      '普通聊天直接回复；电脑任务使用可用工具、Skills、MCP，并在需要时请求审批。',
    ].filter(Boolean).join('\n');

    const startFresh = () =>
      window.electron.cowork.startSession({
        prompt: text,
        title: text.slice(0, 40),
        systemPrompt: roleContext,
      });

    let result = sessionId
      ? await window.electron.cowork.continueSession({
          sessionId,
          prompt: text,
          systemPrompt: roleContext,
        })
      : await startFresh();

    // The pet keeps one shared conversation. Only roll over to a new session
    // when continuing the current one fails — e.g. it is full or has expired —
    // so the user's message still gets through.
    if (!result.success && sessionId) {
      result = await startFresh();
      if (result.success) {
        setPetOutput('刚才的对话满了，已经帮你开了一个新的。');
      }
    }

    if (!result.success) {
      setWorkState(AgentWorkState.Failed);
      setPetOutput(result.error || '任务启动失败。');
      return;
    }

    if (result.session?.id) {
      setSessionId(result.session.id);
      void petService.setPersistedSessionId(result.session.id);
    }
  }, [petState, prompt, sessionId, workState]);

  const newSession = useCallback(() => {
    setSessionId(null);
    void petService.clearPersistedSessionId();
    setWorkState(AgentWorkState.Idle);
    setPetOutput('新对话已开始，说点什么吧。');
    setChatVisible(true);
    setHistoryOpen(false);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const result = await window.electron.cowork.listSessions({ limit: 20, offset: 0 });
      setHistorySessions(result.success && result.sessions ? result.sessions : []);
    } catch {
      setHistorySessions([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const toggleHistory = useCallback(() => {
    setHistoryOpen((open) => {
      const next = !open;
      if (next) void loadHistory();
      return next;
    });
  }, [loadHistory]);

  const switchSession = useCallback(async (summary: CoworkSessionSummary) => {
    setSessionId(summary.id);
    void petService.setPersistedSessionId(summary.id);
    setHistoryOpen(false);
    setChatVisible(true);
    setWorkState(AgentWorkState.Idle);
    try {
      const result = await window.electron.cowork.getSession(summary.id);
      const messages = result?.session?.messages ?? [];
      const lastAssistant = [...messages]
        .reverse()
        .find((message) => message.type === 'assistant' && message.content.trim());
      setPetOutput(
        lastAssistant?.content.trim().slice(0, 200) || summary.title || '已切换到这个对话。',
      );
    } catch {
      setPetOutput(summary.title || '已切换到这个对话。');
    }
  }, []);

  return (
    <div className="pet-shell">
      <div className="pet-drag-region" />

      {chatVisible && (
        <div className="pet-bubble">
          <div className="pet-bubble-title">{stateLabels[workState]}</div>
          <div className="pet-bubble-text">{petOutput}</div>
        </div>
      )}

      {/* Hover halo: a continuous, non-click-through region around the pet. The
          menu/history live inside it as descendants so moving onto them never
          counts as leaving the pet. */}
      <div className="pet-hover" onMouseEnter={openMenu} onMouseLeave={scheduleCloseMenu}>
        {menuOpen && historyOpen && (
          <div className="pet-history">
            {historyLoading ? (
              <div className="pet-history-empty">加载中…</div>
            ) : historySessions.length === 0 ? (
              <div className="pet-history-empty">暂无历史对话</div>
            ) : (
              historySessions.map((summary) => (
                <button
                  key={summary.id}
                  type="button"
                  className={`pet-history-item ${summary.id === sessionId ? 'active' : ''}`}
                  title={summary.title}
                  onClick={() => void switchSession(summary)}
                >
                  <span className="pet-history-title">{summary.title || '未命名对话'}</span>
                </button>
              ))
            )}
          </div>
        )}

        <PetSprite action={action} onMouseDown={handleSpriteMouseDown} />

        <div className={`pet-tools ${menuOpen ? 'is-open' : ''}`}>
          <button
            type="button"
            className={historyOpen ? 'active' : ''}
            title="历史记录"
            onClick={toggleHistory}
          >
            <ClockIcon />
          </button>
          <button type="button" title="工作台" onClick={() => window.electron.pet.showWorkbench()}>
            <WindowIcon />
          </button>
          <button type="button" title="新建对话" onClick={newSession}>
            <PlusIcon />
          </button>
          <button
            type="button"
            className={chatVisible ? 'active' : ''}
            title={chatVisible ? '关闭聊天框' : '显示聊天框'}
            onClick={() => setChatVisible((value) => !value)}
          >
            <ChatBubbleOvalLeftIcon />
          </button>
        </div>
      </div>

      {chatVisible && (
        <form
          className="pet-input"
          onSubmit={(event) => {
            event.preventDefault();
            void sendPrompt();
          }}
        >
          <input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="交给我一个任务"
          />
          <button type="submit" title="发送">
            <PaperAirplaneIcon />
          </button>
        </form>
      )}
    </div>
  );
};

export default PetApp;
