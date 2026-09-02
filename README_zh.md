# Peachclaw

**一只会替你干活的桌面宠物。**

桃子待在屏幕角落，跟着 Agent 的状态动：改文件时它在跑，规划时它在想，干完了冲你挥手。
你可以跟它说话，配上语音服务它还能出声回你。

Windows · Electron 40 · React 18 · [MIT](LICENSE)

---

> **这是一个 fork。** 上游是 [netease-youdao/LobsterAI](https://github.com/netease-youdao/LobsterAI)，
> 一个基于 [OpenClaw](https://github.com/openclaw/openclaw) 引擎的办公助理 Agent。
> 本 fork 加了桌宠、成长系统，以及可选的 MOSS-TTS 语音。
> git 历史从 fork 点重新开始，所以 `git blame` 追不到上游提交。
> 底层应用的完整产品文档请看上游 README。

## 这是什么

桌宠是一个无边框、透明、始终置顶的窗口，浮在所有东西之上（包括全屏应用）。
它下面跑的是完整的 LobsterAI Agent：能读写你的文件、驱动浏览器、执行终端命令，
还能从微信 / 企业微信 / 钉钉 / 飞书 / QQ / Discord 接收指令 —— 每个敏感操作都要你确认。

### 桌宠跟着 Agent 动

精灵图会根据 Agent 当前的工作状态播放对应动作：

| 动作 | 触发时机 |
|---|---|
| `idle` | 没事干（安静 5 秒后回到这个状态） |
| `run` | 读取、写入、浏览、编码、执行 |
| `think` | 思考或规划中 |
| `listen` | 正在听，或等你确认操作 |
| `talk` | 回复正在流式输出 —— 开着语音时会持续到整句说完 |
| `wave` | 本轮完成 |

工作状态是从工具名推断的：`read`/`pdf`/`docx` → 读取，`write`/`edit`/`create` → 写入，
`browser`/`web`/`search` → 浏览，`exec`/`terminal`/`shell` → 执行
（见 `src/renderer/services/pet.ts` 的 `mapMessageToWorkState`）。

### 交互

- **拖动**精灵图移动位置。拖拽走的是 IPC 而不是 `-webkit-app-region: drag` ——
  后者会把悬停菜单一起吞掉。
- **悬停**出菜单：聊天、历史、设置、隐藏。
- **在气泡里打字**开始或继续对话。桌宠维持一个长期会话，重启后自动接上。
- **确认弹窗**：Agent 要做敏感操作时，会单独开一个小窗口让你批准。
- **鼠标穿透**可以开关，开了之后桌宠不再拦截鼠标事件。

### 它会长大

干活就是喂它。每完成一轮会给经验、消耗体力，有时掉食物：

| 来源 | 经验 | 体力 | 食物 |
|---|---|---|---|
| 聊天 | +8 | −3 | — |
| 浏览器任务 | +22 | −10 | +1 |
| 文件任务 | +24 | −12 | +1 |
| 工作流 | +36 | −18 | +2 |
| 回答被标记为有用 | +18 | — | — |

每级 100 经验。设置页还会显示累计 Token 消耗、任务数和心情（`happy` / `focused` / `tired`）。

### 换成你自己的形象

自带的桃子是一张 1536×1872 的图，切成 8×9 的网格，每帧 192×208。
在侧边栏的**桌宠**页面里，**外观 → 上传自定义素材**换成你自己的：先设网格行列数，
再把帧序号映射到六个动作（`idle`、`run`、`listen`、`talk`、`think`、`wave`），
每个动作可单独设 fps。支持 PNG、WebP、JPEG、GIF。

### 语音（可选）

桌宠默认不出声。想让它说话，需要在本地跑一个
[MOSS-TTS-Nano](https://github.com/OpenMOSS/MOSS-TTS-Nano) 服务 ——
它是独立的 Python 服务，**没有**打包进本仓库。
安装步骤、需要打的 patch、以及 Windows 上的几个坑都写在
[`third_party/moss-tts-nano/`](third_party/moss-tts-nano/README.md)。

可以用预设音色，也可以拿自己的录音克隆一个。

---

## 快速开始

### 前置条件

- **Node.js** ≥ 24.15 < 25（`engines` 是强制的 —— `.npmrc` 开了 `engine-strict=true`）
- **Windows 开发者模式** —— OpenClaw runtime 构建要创建符号链接，不开会失败。
  *设置 → 隐私和安全性 → 开发者选项*
- **能访问 GitHub** —— 首次构建要克隆 OpenClaw 源码

### 跑起来

```bash
git clone https://github.com/aalance/peachclaw.git
cd peachclaw
npm run pet
```

Windows 也可以直接双击 `启动桌宠.bat`。两者都是先释放 5175 端口、检查 OpenClaw runtime，
然后调 `npm run electron:dev`。

> 请用 `git clone`，**别用** GitHub 的 Download ZIP。Windows 的「全部解压缩」会在外面
> 再套一层同名文件夹，这时候跑 `npm run pet` 会报 `Could not read package.json` ——
> 因为你站在了上一层目录。

**首次启动要好几分钟。** 它会克隆并构建 OpenClaw runtime（152 个 workspace 项目），
构建过程会长时间没有输出 —— `[tsdown-build] still running pid=… no output for 30s`
是保活心跳，**不是卡死**。等到 `[7/7] Done`，然后 Vite 启动、Electron 窗口弹出。

成功的标志是桃子出现在**桌面右下角**。**别关那个终端窗口** —— 关了桌宠就没了。
之后再启动只需重新编译主进程，大约 15~40 秒。

> `npm run pet` 是 PowerShell 脚本，只能在 Windows 用。macOS/Linux 首次用
> `npm run electron:dev:openclaw`，之后用 `npm run electron:dev`。
> 桌宠窗口本身是跨平台的，只有启动脚本不是。

## 模型和 API Key

**开箱不需要 API Key。** 应用默认连 LobsterAI 官方服务，登录就能用。

想换成自己的模型：**设置 → 自定义模型**，选服务商、填 Key，然后关掉内置服务、
打开你自己的（没配凭证的服务商会被自动禁用）。内置 20+ 服务商 ——
DeepSeek、Moonshot、Qwen、智谱、MiniMax、火山、OpenAI、Anthropic、Gemini、
OpenRouter、Ollama、LM Studio 等 —— 另外还能加最多 10 个自定义的
OpenAI 兼容 / Anthropic 兼容端点，自己填 base URL。

Key 按机器存在 `%APPDATA%\LobsterAI\lobsterai.sqlite`（`kv` 表，键 `app_config`），
是**明文 JSON**，没有走系统钥匙串。不在仓库里，但共用电脑要注意。

## IM 渠道

微信、企业微信、钉钉、飞书、QQ、Discord、邮件都是 OpenClaw 插件，
在 runtime 构建时装到 `vendor/openclaw-runtime/current/third-party-extensions/`。

如果微信配置界面报 **`web login provider is not available`**，说明插件没装上 ——
网关找不到任何注册了 `web.login.start` 的渠道插件。通常是 runtime 构建被中断了。
不用整个重建，跑这一句修复：

```bash
npm run openclaw:plugins
```

`start-pet.ps1` 每次启动都会检查这一点并自动修复。

---

## 开发

| 命令 | 作用 |
|---|---|
| `npm run pet` | 启动桌宠（Windows）—— 端口清理 + runtime 检查 + 开发服务器 |
| `npm run electron:dev` | 同样的流程，但没有桌宠专属的预检 |
| `npm run electron:dev:openclaw` | 先构建 OpenClaw runtime 再启动 |
| `npm run dev` | 只起 Vite 渲染层，不开 Electron 窗口 |
| `npm run build` | 类型检查 + Vite 打包 |
| `npm run compile:electron` | 编译主进程（独立的 tsconfig） |
| `npm run lint` | 对 `src/` 跑 ESLint |
| `npm test` | Vitest（会先把 better-sqlite3 重编译成 Node ABI） |

DevTools 不再自动弹出。需要时设 `OPEN_DEVTOOLS=1`。

### 桌宠代码在哪

```
src/renderer/components/pet/
  PetApp.tsx              悬浮的桌宠窗口
  PetSettingsView.tsx     外观、成长、语音设置
  PetVisibilityToggle.tsx 显示/隐藏开关
  ApprovalApp.tsx         确认弹窗
src/renderer/services/pet.ts    状态、奖励、精灵图解析
src/shared/pet/constants.ts     IPC 通道、工作状态、类型定义
src/shared/pet/security.ts      工具权限分级
resources/pets/peach/           自带的精灵图
```

桌宠跑在自己的 `BrowserWindow` 里（340×430，无边框、透明、
`alwaysOnTop: 'floating'`、`skipTaskbar`、沙箱化 preload），在 `src/main/main.ts` 创建。
它通过 `src/shared/pet/constants.ts` 里定义的 `pet:*` IPC 通道和主进程通信。
外观和状态存在 SQLite 的 `desktop_pet_appearance` 和 `desktop_pet_state` 两个键下。

### 类型检查

两个独立的 project，**都要查**：

```bash
npx tsc --noEmit -p tsconfig.json            # 渲染层 + shared
npx tsc --noEmit -p electron-tsconfig.json   # 主进程
```

`noUnusedLocals` 是开着的，未使用的 import 会直接报错。
提交信息必须符合 Conventional Commits —— `commitlint` 钩子会拦掉不合规的。

## 已知缺陷

- **内置形象包被隐藏了。** 四个配色包（`plush-lobster`、`mint-ghost`、
  `berry-fox`、`slate-robot`）只定义了调色板、没有精灵图，而且渲染层
  从来没读过 `selectedPackId` —— 点选只会高亮一个色块，别的什么都不变。
  等补上真实贴图或实现调色染色之前，这块 UI 先藏起来了。自定义上传不受影响。
- **`package-lock.json` 被 gitignore 了**（继承自上游），所以各人装到的
  依赖版本不保证一致。
- `src/main` 的 SQLite 测试必须用 `npm test`（它会把 better-sqlite3 重编译成
  Node ABI）；直接跑 `vitest` 会因为 Electron ABI 的二进制而失败。

## 许可

MIT —— 见 [LICENSE](LICENSE)，上游部分版权归网易有道。
MOSS-TTS-Nano 是 Apache 2.0，单独克隆，没有内置在本仓库。

English docs: [README.md](README.md)
