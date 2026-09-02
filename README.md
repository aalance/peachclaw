# Peachclaw

**A desktop pet that actually does your work.**

Peach sits in the corner of your screen and reacts to what the agent is doing —
running while it edits files, thinking while it plans, waving when it finishes.
Talk to it and it talks back, out loud if you give it a voice.

Windows · Electron 40 · React 18 · [MIT](LICENSE)

---

> **This is a fork.** Upstream is [netease-youdao/LobsterAI](https://github.com/netease-youdao/LobsterAI),
> an office-assistant agent built on the [OpenClaw](https://github.com/openclaw/openclaw)
> engine. This fork adds the desktop pet, its growth system, and optional
> MOSS-TTS voice. History was restarted at the fork point, so `git blame` does
> not reach upstream commits. For the full product documentation of the
> underlying app, see upstream's README.

## What you get

The pet is a frameless, transparent, always-on-top window that floats above
everything, including full-screen apps. Underneath it is the whole LobsterAI
agent: it can read and write your files, drive a browser, run terminal
commands, and answer from WeChat / WeCom / DingTalk / Feishu / QQ / Discord —
each sensitive action gated behind your approval.

### The pet reacts to the agent

The sprite plays a pose picked from the agent's current work state:

| Pose | When |
|---|---|
| `idle` | nothing happening (falls back after 5s of quiet) |
| `run` | reading, writing, browsing, coding, executing |
| `think` | thinking or planning |
| `listen` | listening, or waiting for your approval |
| `talk` | assistant text is streaming in — held for the whole utterance while speaking |
| `wave` | turn completed |

Work state is inferred from the tool being called: `read`/`pdf`/`docx` → reading,
`write`/`edit`/`create` → writing, `browser`/`web`/`search` → browsing,
`exec`/`terminal`/`shell` → executing (`src/renderer/services/pet.ts`,
`mapMessageToWorkState`).

### Interaction

- **Drag** the sprite to move it. Dragging goes through IPC rather than
  `-webkit-app-region: drag`, which would swallow the hover menu.
- **Hover** for the menu: chat, history, settings, hide.
- **Type** into the bubble to start or continue a conversation. The pet keeps one
  long-running session, persisted across restarts.
- **Approvals** open a separate small window when the agent wants to do something
  sensitive.
- **Click-through** can be toggled so the pet stops intercepting mouse events.

### It grows on you

Finishing work feeds the pet. Every completed turn grants exp, drains energy and
sometimes drops food:

| Source | exp | energy | food |
|---|---|---|---|
| Chat | +8 | −3 | — |
| Browser task | +22 | −10 | +1 |
| File task | +24 | −12 | +1 |
| Workflow | +36 | −18 | +2 |
| Helpful answer confirmed | +18 | — | — |

100 exp per level. The settings page also tracks total tokens spent, task count,
and mood (`happy` / `focused` / `tired`).

### Bring your own sprite

The bundled Peach is a 1536×1872 sheet cut into an 8×9 grid of 192×208 frames.
Upload your own from the **Desktop Pet** page in the sidebar, under
**Appearance → Upload Custom Asset**: set the grid size, then map frame indices to
each pose (`idle`, `run`, `listen`, `talk`, `think`, `wave`) with a per-clip fps.
PNG, WebP, JPEG and GIF are accepted.

### Voice (optional)

The pet is silent by default. Give it a voice by running a local
[MOSS-TTS-Nano](https://github.com/OpenMOSS/MOSS-TTS-Nano) server — it is a
separate Python service, not bundled here. Setup, the required patch, and the
Windows install traps are in
[`third_party/moss-tts-nano/`](third_party/moss-tts-nano/README.md).

You can pick one of the preset voices, or clone a voice from your own recording.

---

## Quick start

### Prerequisites

- **Node.js** ≥ 24.15 < 25 (`engines` is enforced — `.npmrc` sets `engine-strict=true`)
- **Windows Developer Mode** — the OpenClaw runtime build creates symlinks and
  fails without it. *Settings → Privacy & security → For developers*
- **Network access to GitHub** — the first build clones the OpenClaw source

### Run it

```bash
git clone https://github.com/aalance/peachclaw.git
cd peachclaw
npm run pet
```

Windows users can also double-click `启动桌宠.bat`. Both wrap `npm run electron:dev`
after freeing port 5175 and provisioning the OpenClaw runtime.

> Use `git clone`, not GitHub's **Download ZIP**. Windows' "Extract All" nests the
> archive inside a second folder of the same name, and `npm run pet` then fails with
> `Could not read package.json` because you are one directory too high.

**The first launch takes several minutes.** It clones and builds the OpenClaw
runtime (152 workspace projects), and the build goes quiet for long stretches —
`[tsdown-build] still running pid=… no output for 30s` is a keep-alive heartbeat,
not a hang. Wait for `[7/7] Done`, then Vite starts and the Electron window opens.

Success looks like Peach appearing in the bottom-right corner. **Keep the terminal
open** — closing it kills the pet. Later launches only recompile the main process,
about 15–40s.

> `npm run pet` is a PowerShell script and Windows-only. On macOS/Linux use
> `npm run electron:dev:openclaw` for the first run, then `npm run electron:dev`.
> The pet window itself is cross-platform; only the launcher is not.

## Models and API keys

You do **not** need an API key to start. The app connects to LobsterAI's service
by default — sign in and go.

To use your own model instead: **Settings → Custom Model**, pick a provider, paste
the key, then disable the built-in service and enable yours (a provider with no
credentials is disabled automatically). 20+ providers are built in — DeepSeek,
Moonshot, Qwen, Zhipu, MiniMax, Volcengine, OpenAI, Anthropic, Gemini,
OpenRouter, Ollama, LM Studio and more — plus up to 10 custom OpenAI-compatible
or Anthropic-compatible endpoints where you supply your own base URL.

Keys are stored per machine in `%APPDATA%\LobsterAI\lobsterai.sqlite` (the `kv`
table, key `app_config`) as **plaintext JSON** — not in this repo, and not
encrypted with the OS keychain. Worth knowing on a shared machine.

## IM channels

WeChat, WeCom, DingTalk, Feishu, QQ, Discord and email arrive as OpenClaw
plugins, installed into `vendor/openclaw-runtime/current/third-party-extensions/`
during the runtime build.

If the WeChat setup screen says **`web login provider is not available`**, the
plugins are missing: the gateway found no channel plugin registering
`web.login.start`. It usually means an interrupted runtime build. Repair it
without a full rebuild:

```bash
npm run openclaw:plugins
```

`start-pet.ps1` checks for this on every launch and repairs it automatically.

---

## Development

| Command | What it does |
|---|---|
| `npm run pet` | Launch the pet (Windows) — port cleanup + runtime check + dev server |
| `npm run electron:dev` | Same pipeline without the pet-specific preflight |
| `npm run electron:dev:openclaw` | Build the OpenClaw runtime first, then start |
| `npm run dev` | Vite renderer only, no Electron window |
| `npm run build` | Type-check + Vite bundle |
| `npm run compile:electron` | Compile the main process (separate tsconfig) |
| `npm run lint` | ESLint over `src/` |
| `npm test` | Vitest (rebuilds better-sqlite3 for Node first) |

DevTools no longer opens on its own. Set `OPEN_DEVTOOLS=1` when you want it.

### Where the pet lives

```
src/renderer/components/pet/
  PetApp.tsx              the floating pet window
  PetSettingsView.tsx     appearance, growth, voice settings
  PetVisibilityToggle.tsx show/hide control
  ApprovalApp.tsx         the approval popup
src/renderer/services/pet.ts    state, rewards, sprite resolution
src/shared/pet/constants.ts     IPC channels, work states, types
src/shared/pet/security.ts      tool-permission classification
resources/pets/peach/           the bundled spritesheet
```

The pet runs in its own `BrowserWindow` (340×430, frameless, transparent,
`alwaysOnTop: 'floating'`, `skipTaskbar`, sandboxed preload) created in
`src/main/main.ts`. It talks to the main process over the `pet:*` IPC channels
listed in `src/shared/pet/constants.ts`. Appearance and state persist in the
SQLite store under `desktop_pet_appearance` and `desktop_pet_state`.

### Type-checking

Two separate projects — check both:

```bash
npx tsc --noEmit -p tsconfig.json            # renderer + shared
npx tsc --noEmit -p electron-tsconfig.json   # main process
```

`noUnusedLocals` is on, so an unused import is a hard error. Commit messages must
follow Conventional Commits — a `commitlint` hook rejects anything else.

## Known gaps

- **Built-in resource packs are hidden.** The four colour packs
  (`plush-lobster`, `mint-ghost`, `berry-fox`, `slate-robot`) define palettes but
  ship no spritesheets, and the renderer never read `selectedPackId`, so picking
  one highlighted a swatch and changed nothing. The UI is hidden until packs have
  real sprites or palette tinting. Custom uploads work.
- **`package-lock.json` is gitignored** (inherited from upstream), so dependency
  versions are not pinned across machines.
- The `src/main` SQLite tests need `npm test` (which rebuilds better-sqlite3 for
  Node); running `vitest` directly fails on the Electron-ABI binary.

## License

MIT — see [LICENSE](LICENSE). Copyright NetEase Youdao for the upstream work.
MOSS-TTS-Nano is Apache 2.0 and is cloned separately, not vendored here.

中文文档见 [README_zh.md](README_zh.md)。
