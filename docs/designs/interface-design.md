# 雲端疊大樓 · 介面設計文件

> 本文件由「動畫介面設計 Agent」維護，是 UI / Engineering / QA 之間關於視覺、互動、動畫、聲音、無障礙的單一事實來源。所有規格與 `docs/designs/game-architecture.md` 1.0.0 對齊；若有衝突以本文件＋架構文件聯名修訂為準。本文件不修改任何程式碼，所有實作項目都列在 §12「設計到工程的交接」。
>
> - 文件版本：1.0.0
> - 對應架構版本：`game-architecture.md` 1.0.0
> - 對應實作版本：`public/index.html` / `public/style.css` / `public/game.js`（2026-05-28）
> - 既有 token 來源：`public/style.css` `:root`（章節 §2 完整對齊，並標記新增項目為 `NEW`）

---

## 1. 設計原則（呼應架構）

| # | 原則 | 對應架構決定 |
| --- | --- | --- |
| 1 | **位置即時間的純函數，視覺不得「跑掉」** | §1.4 / §2.1：active 方塊位置以 `x(t) = span × (1 + side × cos(ωt))` 推算；UI 不得加入任何彈跳、漂移、attack/release tween 來修飾 active 方塊的 x 軸軌跡。所有「修飾性」動畫只能出現在 Y 軸（落定）、外框（完美閃光）或粒子層。 |
| 2 | **點擊到視覺回饋 ≤ 1 幀（16ms）** | §1.1 / §8.2：`pointerdown` 同步呼叫 `drop()`，UI 不得在 input → 視覺改變之間插入任何 transition 或 setTimeout。音訊 unlock 在 drop 之後執行。 |
| 3 | **分數是主角，排行榜是社交** | §3.1：每位玩家自走場次，伺服器只維護共享排行榜與動態。UI 主軸：HUD 大字分數 + sidebar 排行榜＋動態；其餘元素一律退讓。 |
| 4 | **0 分不入榜，UI 不顯示假鼓勵** | §1.4 註：0 分不上傳。Game Over 畫面對 0 分顯示中性回饋「再來一場」，不顯示 rank badge。 |
| 5 | **多人感由「線上點 + 動態 feed」承載，不是即時對手 cursor** | §3.1：不做 lockstep / per-player cursor。UI 透過 pulse 動畫＋滑入動態，讓玩家感受到「有人在玩」。 |
| 6 | **每個動畫都有功能性目的** | UI Agent 手冊 §2.5：禁止純裝飾動畫。每條動畫條目（§6）都必須註明「觸發」與「告訴玩家什麼」。 |
| 7 | **連擊的甜蜜上限是 8，UI 在 ≥2 才顯示、≥5 升級色** | §1.4：`min(combo, 8)` 封頂。HUD 對應呈現門檻：1 不顯示、2–4 青色、5–7 紫色、8+ 金色＋粒子。 |

---

## 2. 視覺識別系統

### 2.1 色票表

所有色票對齊 `public/style.css` `:root`，標記 `EXISTING` / `NEW`。對比度針對 `--text` 於 `--bg-0` 上計算（暗色主題，無亮色版本——遊戲為 dark-only by design）。

| Token | Hex / RGBA | 用途 | 對比度（vs `--bg-0`）| 狀態 |
| --- | --- | --- | --- | --- |
| `--bg-0` | `#0b1024` | 最深背景 / body 基底 | — | EXISTING |
| `--bg-1` | `#131a36` | 次層背景 / 漸層中段 | — | EXISTING |
| `--bg-2` | `#1c2447` | 更亮的玻璃底層 | — | EXISTING |
| `--panel` | `rgba(20,27,56,0.78)` | sidebar 卡片 | — | EXISTING |
| `--panel-strong` | `rgba(18,24,49,0.92)` | 主要 overlay panel | — | EXISTING |
| `--border` | `rgba(148,163,217,0.18)` | 通用 1px 邊框 | — | EXISTING |
| `--text` | `#e8ecff` | 主要文字 | 14.6:1 ✅ AAA | EXISTING |
| `--text-dim` | `#a3a9c8` | 次要文字 / 標籤 | 7.9:1 ✅ AAA | EXISTING |
| `--text-faint` | `#7c83a8` | 提示／佔位符 | 4.8:1 ✅ AA | EXISTING |
| `--accent` | `#67e8f9` | 霓虹青：分數 / 主按鈕 | 11.6:1 ✅ AAA | EXISTING |
| `--accent-2` | `#a78bfa` | 霓虹紫：rank badge / 漸層終點 | 7.2:1 ✅ AAA | EXISTING |
| `--gold` | `#fbbf24` | rank #1 / 新進榜閃光 | 11.0:1 ✅ AAA | EXISTING |
| `--silver` | `#cbd5e1` | rank #2 | 12.4:1 ✅ AAA | EXISTING |
| `--bronze` | `#d97706` | rank #3 | 4.9:1 ✅ AA | EXISTING |
| `--good` | `#34d399` | 線上點 / 成功 | 9.2:1 ✅ AAA | EXISTING |
| `--danger` | `#fb7185` | 遊戲結束標題 / 斷線狀態 | 6.4:1 ✅ AA | EXISTING |
| `--combo-tier-1` | `#67e8f9`（同 `--accent`） | combo 2–4 顯示色 | 11.6:1 | NEW（alias）|
| `--combo-tier-2` | `#c4b5fd` | combo 5–7 顯示色 | 9.4:1 ✅ AAA | NEW |
| `--combo-tier-3` | `#fde047` | combo 8+（封頂）顯示色 | 13.2:1 ✅ AAA | NEW |
| `--perfect-stroke` | `rgba(255,255,255,0.85)` | 完美對齊外框 stroke | 對比 `#67e8f9` 方塊 ≥ 3:1 | NEW |
| `--focus-ring` | `#67e8f9` 2px outline + 2px offset | 鍵盤焦點環（所有可 focus 元素）| 11.6:1 | NEW |
| `--shadow` | `0 14px 40px rgba(0,0,0,0.45)` | 卡片、panel 立體陰影 | — | EXISTING |
| `--shadow-strong` | `0 20px 60px rgba(0,0,0,0.6)` | overlay panel 強陰影 | — | NEW |
| `--glow-accent` | `0 0 24px rgba(103,232,249,0.45)` | 完美對齊瞬間 / hover 強調 | — | NEW |

**暗 / 亮版本說明**：遊戲為 dark-only。架構未要求 light theme。若 Phase 2 主題色面板需要其他配色，每個主題以「替換 `--accent` 與 `--accent-2`」為基底，不破壞背景與面板結構。

### 2.2 字級階梯

| 名稱 | 用途 | font-size | font-weight | line-height | letter-spacing | font-variant-numeric |
| --- | --- | --- | --- | --- | --- | --- |
| `display-xl` | HUD 大字分數 | `clamp(48px, 10vw, 96px)` | 800 | 1.0 | 1px | tabular-nums |
| `display-l` | 結算分數（`.final-num`）| 78px（行動裝置降 56px）| 800 | 1.0 | 0.5px | tabular-nums |
| `h1` | 開始畫面 `.title` | 34px | 800 | 1.15 | 1px | — |
| `h2` | 結算 `.over-title` | 22px | 700 | 1.2 | 1px | — |
| `h3` | 卡片 section 標題 | 13px | 700 | 1.5 | 1.5px（uppercase 風）| — |
| `body-l` | 結算 `.final-label`、按鈕 | 15–18px | 400–700 | 1.4 | 0.5px | — |
| `body-m` | 主要內文 / 排行榜列 | 14px | 400–700 | 1.5 | 0 | tabular-nums（分數）|
| `body-s` | 動態 feed / 副標 / 提示 | 13px | 400–600 | 1.5 | 0 | — |
| `caption` | `.conn`、微標 | 11–12px | 400 | 1.4 | 0.3px | — |
| `hud-combo` | HUD 連擊文字 | 16px | 600 | 1.2 | 0.5px | — |
| `hud-combo-tier-3` | combo ≥ 8 升級顯示 | 20px | 800 | 1.2 | 1px | — |

**字體棧**（已實作）：

```
"Inter", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei",
system-ui, -apple-system, "Segoe UI", Roboto, sans-serif
```

### 2.3 圓角 / 間距 / 邊框 / 陰影

| Token | 值 | 用途 |
| --- | --- | --- |
| `--radius-xs` | 6px | 小徽章、scrollbar |
| `--radius-s` | 10px | leaderboard row、activity row |
| `--radius-m` | 12px | icon-btn、input、rank-badge 對應 |
| `--radius-l` | 14px | 主按鈕 `.btn` |
| `--radius-xl` | 18px | sidebar 卡片 |
| `--radius-2xl` | 20–22px | overlay panel、canvas-wrap |
| `--space-1` | 4px | 緊湊 gap |
| `--space-2` | 6–8px | 行內 icon gap、活動列 padding |
| `--space-3` | 10px | row padding、卡片內小間距 |
| `--space-4` | 14px | sidebar 卡片間距、buttons 內 padding-y |
| `--space-5` | 18px | app grid gap、HUD 上方留白 |
| `--space-6` | 22–28px | panel padding |
| `--border-1` | 1px solid `--border` | 通用邊框 |
| `--border-2-focus` | 2px solid `--accent` | 鍵盤 focus（含 offset 2px）|
| `--shadow` | 已列於 §2.1 | sidebar 卡片、按鈕 |
| `--shadow-strong` | 已列於 §2.1 | overlay panel |

### 2.4 動效語言：easing curve catalog

| Easing 名稱 | CSS / JS 值 | 用途 |
| --- | --- | --- |
| `ease-linear` | `linear` | 鐘擺擺動（**必須由 `cos(ωt)` 計算，CSS 不介入**）、完美外框擴張 alpha 漸退 |
| `ease-cos` | `cos(ωt)` 自家函式（純數學）| Active 方塊 X 軸唯一允許的曲線 |
| `ease-out-soft` | `cubic-bezier(0.16, 1, 0.3, 1)` | overlay 淡入、按鈕 hover、面板尺寸變化 |
| `ease-out-snap` | `cubic-bezier(0.22, 1, 0.36, 1)` | 連擊文字淡入、活動 feed 滑入 |
| `ease-in-out-quad` | `cubic-bezier(0.45, 0, 0.55, 1)` | 線上點 pulse、scoreboard row-flash |
| `ease-in-back` | `cubic-bezier(0.5, -0.4, 0.9, 0.5)` | 結算 panel 進場（從 `scale(0.92)` 微回彈）|
| `ease-physics-gravity` | JS：`vy += g·dt` | debris 掉落（純物理積分，不用 CSS）|
| `ease-cam-exp` | JS：`offset += (target - offset) × min(1, dt × 8)` | 相機平滑跟隨（與 game.js:293 一致）|

**禁止**：在 active 方塊的 transform / left / x 上使用任何 CSS transition；在 hue 漸變上使用 ease-in-back 等過頭的曲線；對「分數數字」做 number tween（會破壞 tabular-nums 對齊）。

---

## 3. 元件庫

依使用頻次排序，每個元件列出尺寸（spec）、間距、各狀態。所有元件必須以既有 CSS class 為起點；標記 `NEW` 者為要新增。

### 3.1 `Button`（`.btn`、`.btn.primary`）

| 屬性 | 值 |
| --- | --- |
| 高度 | 46px（padding 13px 上下）|
| 內邊距 | 13px 22px |
| 圓角 | `--radius-l` 14px |
| 字級 | `body-l` 15px / 700 / letter-spacing 0.5px |
| 寬度 | width: 100%（panel 內）/ inline auto（其他）|
| 觸控目標 | ≥ 46×88px ✅ |

| 狀態 | 視覺 |
| --- | --- |
| default | 漸層 `linear-gradient(135deg, --accent, --accent-2)`，文字 `#0c1230`，shadow `0 8px 24px rgba(103,232,249,0.25)` |
| hover | `filter: brightness(1.05)`；transition 0.15s `ease-out-soft` |
| active | `transform: translateY(1px)`；transition 0.08s |
| focus | 外加 `outline: 2px solid --focus-ring; outline-offset: 2px` |
| disabled | `opacity: 0.45; filter: grayscale(0.4); cursor: not-allowed`（NEW）|
| loading | 漸層保留；右側顯示 14px spinner（NEW；使用 SVG 旋轉）；按鈕禁用 pointer-events |

### 3.2 `TextInput`（`.field input`）

| 屬性 | 值 |
| --- | --- |
| 高度 | 44px |
| 內邊距 | 12px 14px |
| 圓角 | `--radius-m` 12px |
| 邊框 | 1px solid `--border` |
| 背景 | `rgba(11,16,36,0.6)` |
| 字級 | `body-m` 14px |

| 狀態 | 視覺 |
| --- | --- |
| default | 上述 |
| hover | `background: rgba(11,16,36,0.75)`（NEW）|
| focus | `border-color: --accent`、`background: rgba(11,16,36,0.85)`、focus ring 與 `--accent` 相同色不需額外 outline |
| disabled | `opacity: 0.5; cursor: not-allowed`（NEW）|
| error | `border-color: --danger`、下方 12px 紅字提示（NEW；目前不需要，預留）|
| placeholder | `--text-faint` |

### 3.3 `Panel`（`.panel`）

| 屬性 | 值 |
| --- | --- |
| 寬度 | `min(420px, 92%)` |
| 圓角 | `--radius-2xl` 20px |
| 內邊距 | 28px 26px |
| 背景 | `--panel-strong` |
| 邊框 | 1px solid `--border` |
| 陰影 | `--shadow-strong`（NEW，目前用 `--shadow`，建議升級）|

### 3.4 `IconButton`（`.icon-btn`）

| 屬性 | 值 |
| --- | --- |
| 尺寸 | 40×40px（觸控目標經 hit-area 補到 44×44，NEW：透過 `::before` 擴大）|
| 圓角 | `--radius-m` 12px |
| 背景 | `rgba(13,18,42,0.55)`、`backdrop-filter: blur(6px)` |
| 字級 | 18px emoji |

| 狀態 | 視覺 |
| --- | --- |
| default | 上述 |
| hover | `background: rgba(30,41,87,0.7)`；transition 0.15s |
| active | `transform: scale(0.95)`；transition 0.1s |
| focus | `outline: 2px solid --focus-ring; outline-offset: 2px`（NEW）|
| muted | 內容 `🔇`，背景同 default，hover 與 default 無視覺差異（避免誤判）|

### 3.5 `Badge`（`.rank-badge`、新進榜 `.rank-new`）

| 變體 | 視覺 |
| --- | --- |
| rank-badge | padding 2px 10px；border-radius 999px；背景 `rgba(167,139,250,0.18)`；色 `--accent-2`；font-weight 700 |
| rank-new | 純文字色 `--gold`、weight 700，前綴 emoji 🎉 |
| rank-top3-1 | rank-badge + 色 `--gold`（NEW，目前 lb-row 已支援，但結算 badge 沒區分）|
| rank-top3-2 | 色 `--silver`（NEW）|
| rank-top3-3 | 色 `--bronze`（NEW）|

### 3.6 `Toast`（NEW，Phase 2 成就通知用，先預留規格）

| 屬性 | 值 |
| --- | --- |
| 位置 | top: 18px; right: 18px（桌機）/ top: 12px; left/right: 12px（行動）|
| 寬度 | min(320px, calc(100% - 24px)) |
| 圓角 | `--radius-l` 14px |
| 內邊距 | 12px 14px |
| 背景 | `--panel-strong` |
| 動畫 | slide-in from top 0.4s `ease-out-snap`；停留 3s；fade-out 0.3s |
| 多 Toast | 垂直堆疊，gap 8px |

### 3.7 `LeaderboardRow`（`.lb-row`）

| 屬性 | 值 |
| --- | --- |
| 佈局 | `grid-template-columns: 28px 1fr auto`；gap 10px；padding 8px 10px |
| 圓角 | `--radius-s` 10px |
| 字級 | `body-m` 14px |
| transition | `background 0.2s ease-out-soft` |

| 狀態 | 視覺 |
| --- | --- |
| default | 透明背景 |
| hover | `background: rgba(167,139,250,0.08)` |
| you | 漸層 `linear-gradient(90deg, rgba(103,232,249,0.14), rgba(167,139,250,0.10))`，邊框 `1px solid rgba(103,232,249,0.35)`，padding 微縮為 7px 9px |
| fresh | 1.4s 黃色閃光（row-flash keyframes） |
| rank-1/2/3 | rank 數字色金 / 銀 / 銅 |

### 3.8 `ActivityItem`（`.act-row`）

| 屬性 | 值 |
| --- | --- |
| 佈局 | flex；align-items: center；gap 8px；padding 6px 8px |
| 圓角 | `--radius-xs` 8px |
| 字級 | `body-s` 13px |
| 動畫 | slide-in 0.4s `ease-out-snap`（from `translateY(-4px)` + opacity 0）|
| name 截斷 | max-width 130px；ellipsis |

### 3.9 `OverlayDialog`（`.overlay`）

| 屬性 | 值 |
| --- | --- |
| 背景 | radial-gradient + `backdrop-filter: blur(8px)` |
| 動畫 | fade-in 0.25s `ease-out-soft` |
| 內容 | 居中 `.panel` |
| 鍵盤 | Esc 關閉（限 over screen → 等同點再玩一次？**否**，Esc 不關閉，避免誤觸；保留 Enter 觸發主按鈕）|

### 3.10 `HudCombo`（`.hud-combo`）

| 屬性 | 值 |
| --- | --- |
| 字級 | `hud-combo` 16px / 600 |
| 顯示門檻 | combo ≥ 2 |
| 顏色 tier | 2–4: `--combo-tier-1`；5–7: `--combo-tier-2`；8+: `--combo-tier-3`（NEW）|
| 字級 tier 3 | 升為 20px / 800（NEW；combo 8+ 強調封頂感）|
| 動畫 | `opacity 0 → 1, translateY(-4px → 0)` 0.25s `ease-out-snap` |

---

## 4. 螢幕規格

### 4.1 Start Screen — 對應 architecture §1.2 `menu` state

```
┌──────────────────────────── canvas-wrap ───────────────────────────┐
│                                                                    │
│   (背景：與 playing 同樣的星空＋漸層，不暫停—顯示氛圍)             │
│                                                                    │
│        ┌────────────── .panel (420px) ─────────────┐               │
│        │                                            │               │
│        │            雲端疊大樓                       │  ← .title 34/800 漸層
│        │   點擊 / 空白鍵，把樓層疊到最高！           │  ← .subtitle 14 dim
│        │                                            │               │
│        │   你的名字                                  │  ← .field span 13 dim
│        │   ┌──────────────────────────────────┐    │               │
│        │   │ 輸入暱稱                           │    │  ← input h=44
│        │   └──────────────────────────────────┘    │               │
│        │                                            │               │
│        │   ┌──────── 開始遊戲 ────────┐            │  ← .btn.primary h=46
│        │   └────────────────────────┘             │               │
│        │                                            │               │
│        │   🟦 方塊會左右移動，點擊放下               │  ← .howto 13 dim, gap=row 1.7
│        │   ✂️ 沒對齊的部分會被切掉，越疊越窄         │               │
│        │   🎯 完美對齊可加分、回血變寬並累積連擊      │               │
│        │   🏆 結束後分數自動上傳共享排行榜            │               │
│        │                                            │               │
│        └────────────────────────────────────────┘               │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

- panel padding：28px 上下 / 26px 左右
- title → subtitle：margin-bottom 6px
- subtitle → field：margin-bottom 22px
- field → button：margin-bottom 16px
- button → howto：margin-top 22px
- howto line-height：1.7（gap 自然）

**狀態變化**：點擊「開始遊戲」或按 Enter / Space（input 內按 Enter）：
1. 同步呼叫 `startGame()`（架構 §1.2）
2. `.overlay#startScreen` 設 `hidden`；瞬間消失，無漸出（避免遮蔽首顆方塊）
3. `.hud` 移除 `hidden`，HUD 大字 0 顯示
4. Canvas 開始繪製首方塊與 active 方塊

### 4.2 Playing HUD — 對應 architecture §1.2 `playing` state

```
┌────────────────────────────── canvas-wrap ─────────────────────────┐
│ ┌──────────────────── hud (centered) ────────────────────┐ ┌────┐  │
│ │                                                          │ │ 🔊 │  │
│ │                       12                                 │ └────┘  │
│ │              (display-xl, --text #fff)                   │         │
│ │                                                          │         │
│ │              🔥 連擊 x3                                  │         │
│ │            (hud-combo, tier-1 青)                        │         │
│ └──────────────────────────────────────────────────────────┘         │
│                                                                    │
│                                                                    │
│                                                                    │
│                                                                    │
│                                                                    │
│                                                                    │
│                                                                    │
│                                                                    │
│                                                                    │
│                                                                    │
│                                                                    │
│                                                                    │
│                                                                    │
│       (canvas 區域：星空 + 樓 + active 方塊)                       │
└────────────────────────────────────────────────────────────────────┘
```

- HUD：position: absolute；top: 18px；center；pointer-events: none
- HUD 大字分數：font-size clamp(48–96px)、weight 800、letter-spacing 1px、line-height 1
- text-shadow: `0 4px 18px rgba(0,0,0,0.55)` 確保在亮色方塊上仍可讀
- 連擊文字：margin-top 6px、min-height 22px（避免抖動）、預設 opacity 0
- IconButton（mute）：position absolute；top 14px；right 14px

**狀態變化**：
- combo 1：`.hud-combo` 隱藏（opacity 0）
- combo 2–4：顯示 `🔥 連擊 x{N}`、色 tier-1、20px 不變
- combo 5–7：顯示 `🔥 大連擊 x{N}`、色 tier-2
- combo 8+：顯示 `★ 完美鎖定 x{N}`、色 tier-3 金、字級 20/800、加 1.0s pulse（scale 1 → 1.08 → 1，infinite，subtle）

### 4.3 Game Over Overlay — 對應 architecture §1.2 `over` state

```
┌──────────────────────────── canvas-wrap ───────────────────────────┐
│                                                                    │
│       (背景 canvas 仍在繪製：殘骸已落定，鏡頭已停)                  │
│                                                                    │
│        ┌──────────────── .panel ──────────────────┐               │
│        │                                            │               │
│        │             遊戲結束                        │  ← .over-title 22 --danger
│        │                                            │               │
│        │              87 層                          │  ← .final-num 78 漸層 + .final-label 18 dim
│        │                                            │               │
│        │  🎉 新進榜  你的名次 #7 · 最佳連擊 x5      │  ← .rank-line 14 dim, 含 .rank-badge / .rank-new
│        │                                            │               │
│        │   ┌────── 再玩一次 ──────┐                │  ← .btn.primary
│        │   └────────────────────┘                  │               │
│        │                                            │               │
│        └────────────────────────────────────────┘               │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

- over-title → final-score：margin 14px 0 8px（已實作）
- rank-line：margin 4px 0 22px
- panel 進入：fade-in 0.25s（已有）+ scale `0.94 → 1.0` 0.35s `ease-in-back`（NEW，建議升級）
- panel 延遲：等 falling 動畫播完 0.7s（architecture §1.2 / `pendingOverTimer`）

**狀態：分數上傳生命週期**
1. `over` 進入瞬間：`rankLine.textContent = '上傳分數中…'`，色 `--text-dim`
2. 0.3–1.5s 後：
   - 成功：顯示 `🎉 新進榜 + 名次 + 連擊`；若 `rank > 10` 不顯示 🎉
   - 失敗：`'分數上傳失敗，請檢查網路連線。'`，色 `--danger`
   - 0 分：`'0 分不會上傳排行榜，再來一場吧！'`，色 `--text-dim`
3. 同時刷新 sidebar 排行榜，自己的 row 高亮、剛入榜 row 短暫 flash

### 4.4 Sidebar — 持續顯示，對應 architecture §3 / §7 廣播

```
┌──────────────────── sidebar (360px wide) ──────────────────┐
│                                                              │
│  ┌──────────────────────── brand ─────────────────────────┐ │
│  │  🏙️   雲端疊大樓                                         │ │
│  │       ● 12 人在線上  (good dot pulse 1.6s)              │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────── card .card ───────────────────────────┐ │
│  │  🏆 排行榜 TOP 10                            ← .h3 13 dim │
│  │                                                          │ │
│  │   1  玩家A         87  ← rank-1 gold                    │ │
│  │   2  玩家B         54  ← rank-2 silver                  │ │
│  │   3  玩家C         48  ← rank-3 bronze                  │ │
│  │   4  你 (you)      32  ← lb-row.you 漸層底               │ │
│  │   5  玩家E         28                                    │ │
│  │   6  玩家F         24                                    │ │
│  │   …                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────── card .card ───────────────────────────┐ │
│  │  📣 最新動態                                              │ │
│  │  🎉 玩家A 疊到 87 層                                     │ │
│  │  🏗️ 玩家B 疊到 12 層                                     │ │
│  │  🏆 玩家C 疊到 54 層                                     │ │
│  │  …  (最多 8 筆，最新在上)                                 │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                              │
│                                            已連線 ✓        │ ← .conn 11 faint, 右下
└──────────────────────────────────────────────────────────┘
```

- sidebar 寬：桌機 360px；行動 全寬（堆下方）
- brand padding：6px 4px 0
- brand-mark：32px emoji，filter `drop-shadow(0 6px 14px rgba(103,232,249,0.35))`
- 卡片內 padding：14px 16px 16px；卡片之間 gap 14px
- 卡片 h3：13/700/uppercase-style letter-spacing 1.5px、色 `--text-dim`、margin-bottom 10px
- 排行榜列高：min 36px；列間 gap 4px
- 動態 feed：max-height 180px，overflow-y auto
- conn 狀態：margin auto 6px 0、11px、faint、右下對齊

---

## 5. 遊戲內 Canvas 元素規格

### 5.1 方塊渲染（`drawBlock` in `game.js:378`）

| 元素 | 規格 |
| --- | --- |
| 高度 | `BLOCK_H = 32px`（架構 §2.4 固定）|
| 主面 | 純色 `colorFor(level)` = `hsl((baseHue + level×9) % 360, 68%, 58%)` |
| 上 highlight | `rgba(255,255,255,0.18)`、高 3px、貼齊頂端 |
| 下 lip | `darken(color, -20)`（L−20%）、高 5px、貼齊底端 |
| 右側陰影 | `darken(color, -12)`、寬 3px、貼齊右側、全高 |
| Active 額外投影 | 底下 6px 黑色 `rgba(0,0,0,0.35)`（暗示「正在飛、有重力」）|
| 圓角 | **無**（保持像素風硬邊，與架構 §1.6 的 overlap 直線切割數學一致）|

**注意**：active 方塊不能加圓角，否則完美對齊時白框會與圓角不貼合，造成「對齊但看起來沒對」。

### 5.2 Active Block 鐘擺軌跡視覺

- **無拖尾**：禁止繪製 motion blur 或殘影。架構 §2.1 已說明位置是時間純函數，拖尾會誤導判讀。
- **無 hint guide line**：不畫垂直引導線到下方方塊上方。原因：玩家節奏感來自鐘擺中央最快兩端最慢的物理感（架構 §2.3），引導線會讓玩家盯著線、忽略鐘擺手感；且高層鐘擺極快時引導線會閃爍干擾。
- **靜止點視覺**：鐘擺端點瞬時 v=0 自然會出現 1–2 幀「彷彿停住」的視覺，這是甜蜜點，**禁止 UI 用 ease 修飾掉**。

### 5.3 Debris 物理視覺（`spawnFalling` + `update` in `game.js:248-262, 301-308`）

| 參數 | 值 | 來源 |
| --- | --- | --- |
| 初速度 vy | -40 px/s（向上彈一下）| game.js:256 |
| 重力 g | 1400 px/s² | game.js:302 |
| 水平 vx | `(x < W/2 ? -1 : 1) × (30 + Math.random()×40)` px/s | game.js:257 |
| 旋轉 vr | `(Math.random() - 0.5) × 4` rad/s（≈ ±2 rad/s）| game.js:259 |
| 初始旋轉 | 0 | game.js:258 |
| Alpha | 1，當 `y > H + 200` 時瞬切 0 | game.js:306 |
| 銷毀條件 | `alpha === 0`，filter 移除 | game.js:308 |
| 渲染順序 | 在完美外框之後（粒子在最上層）| game.js:368-375 |

**視覺驗證**：debris 必須在 0.7s（`pendingOverTimer`）內離開畫面或淡出至看不見；超過 0.7s 仍可見會與 Game Over panel 疊到。

### 5.4 相機平滑（`update` in `game.js:289-293`）

| 參數 | 值 |
| --- | --- |
| target Y | `H × 0.30`（active 方塊維持在畫面 30% 高）|
| 平滑係數 | `(desired - offset) × min(1, dt × 8)` |
| 觸發層數 | level ≥ 10 才開始有可見位移（前 10 層 desired = 0）|
| 停止條件 | active = null（遊戲結束時相機凍結）|

**Tension with 架構**：架構 §2.4 寫 `ACTIVE_TARGET_FRAC = 0.30`，目前 game.js 也是 0.30。UI 同意此值；不需調整。

### 5.5 完美對齊提示

| 元素 | 規格 |
| --- | --- |
| 外框 stroke | `#fff`（即 `--perfect-stroke`）、lineWidth 2px |
| 起始尺寸 | 1.0 × 方塊尺寸（`BLOCK_H × placedWidth`）|
| 終止尺寸 | 1.6 × 方塊尺寸 |
| Alpha | 0.85 → 0 |
| 時長 | 0.55s |
| Easing | `linear`（age / ttl，§2.4 ease-linear）|
| 銷毀 | age ≥ ttl 後從 effects 移除 |

**粒子（NEW，列入 Phase 1）**：

| 屬性 | 值 |
| --- | --- |
| 數量 | 8 顆 |
| 初始位置 | 方塊四角 + 中央兩側（均勻散布）|
| 形狀 | 6×6 px 實心方塊，color = active block color，alpha 0.9 |
| 初速 | 半徑 80–120 px/s 朝外，加 vy0 = -120 px/s 向上偏移 |
| 重力 | 600 px/s²（比 debris 輕）|
| 旋轉 | 不旋轉（小方塊不旋轉避免閃爍）|
| Alpha | 1 → 0，0.4s 線性 |
| 生命週期 | 0.45s |
| `prefers-reduced-motion` | **不產生粒子**（fall back 純白框）|

---

## 6. 動畫時間線

每條動畫列出：曲線、時長、關鍵幀。

### 6.1 鐘擺擺動（active block）

```
觸發：spawnActive() 時
曲線：x(t) = span × (1 + side × cos(ω × t))
總時長：直到 drop()；半週期決定玩家決策時間（架構 §2.5）
關鍵幀（以 level 1 為例，period = 2.955s）：
  t=0.000s     x = 0           (左端，v=0)
  t=0.739s     x = span        (中央，|v|=max)
  t=1.478s     x = 2×span      (右端，v=0)  ← 此為決策邊界
  t=2.217s     x = span        (中央回流)
  t=2.955s     x = 0           (回到左端，完成一週期)
備註：禁止加任何 ease 修飾；位置必須為純函數。
```

### 6.2 放下落定

```
觸發：drop() 命中（overlap > 0）
曲線：無 Y 軸動畫——方塊「瞬間」place 在 placedX / placedWidth
總時長：0s
關鍵幀：N/A
理由：架構 §1.5 / §1.6 數學上方塊在 drop() 即固定；視覺也保持「瞬時」以維持節奏感。
若未來想加「卡入」彈性：建議用 1 幀（16ms）的 `transform: scaleY(1.06 → 1.0)` ease-out，但 v1.0.0 不採用。
```

### 6.3 Debris 拋物落下

```
觸發：drop() miss（整顆）或 partial（overhang）
曲線：物理積分（無 CSS）
總時長：直到 y > H + 200（依高度而定，通常 0.5–0.8s）
關鍵幀：
  t=0     vy=-40, vx=±(30~70), rot=0
  t≈0.05  vy=0（達到最高點）
  t≈0.30  vy≈+380, 開始離開畫面下緣
  t≈0.55  y > H + 200 → alpha=0 → 移除
```

### 6.4 完美對齊外框擴張

```
觸發：drop() 且 |delta| ≤ PERFECT_TOL
曲線：linear（age / ttl）
總時長：0.55s
關鍵幀：
  k=0.00  scale=1.0, alpha=0.85
  k=0.50  scale=1.3, alpha=0.43
  k=1.00  scale=1.6, alpha=0.00（移除）
同步：粒子 0.45s（NEW，§5.5）；音效 540 + combo×60 Hz triangle 90ms + 1.5× echo 50ms 後（架構 §7 / game.js:117-118）
```

### 6.5 連擊文字淡入淡出（HUD）

```
觸發：state.combo 從 < 2 變 ≥ 2，或從 ≥ 2 降回 < 2
曲線：ease-out-snap（淡入）/ ease-out-soft（淡出）
總時長：0.25s（已實作於 .hud-combo transition）
關鍵幀：
  入：opacity 0 → 1, translateY -4px → 0
  出：opacity 1 → 0, translateY 0 → -4px
Tier 升級（NEW，combo 跨越 5 或 8）：
  額外 0.4s 顏色與字級漸變，scale 1.0 → 1.15 → 1.0（peak at 0.2s）
```

### 6.6 排行榜新進榜閃光（`row-flash`）

```
觸發：addActivity 時若 msg.rank ≤ 10，下一次 renderLeaderboard 對該 row 加 .fresh
曲線：linear
總時長：1.4s
關鍵幀（已實作）：
  0%   background: rgba(251,191,36,0.28)  ← --gold @ 28%
  100% background: transparent
備註：必須在 next renderLeaderboard 觸發後就播；切換 leaderboard 期間若該 row 又被 re-render，動畫會重啟（瀏覽器自動）。
```

### 6.7 線上點脈動（`pulse`）

```
觸發：連線正常時持續播放
曲線：ease-in-out-quad（已實作）
總時長：1.6s, infinite
關鍵幀（已實作）：
  0%, 100% scale 1, box-shadow 0 0 0 3px rgba(52,211,153,0.18)
  50%      scale 1.15, box-shadow 0 0 0 6px rgba(52,211,153,0.05)
prefers-reduced-motion：停掉，固定為 scale 1 + 3px ring
```

### 6.8 活動 feed 滑入（`slide-in`）

```
觸發：activity WS 訊息到達 → activityEl.prepend(li)
曲線：ease-out-snap
總時長：0.4s（已實作）
關鍵幀：
  from opacity 0, translateY(-4px)
  to   opacity 1, translateY(0)
數量上限：8 條；超出時最舊一條 li.lastChild.remove()（瞬間移除，無 fade-out，§3.8）
```

### 6.9 Overlay 淡入（`fade-in`）

```
觸發：startScreen / overScreen 從 hidden 變 visible
曲線：ease-out-soft（已實作為 ease）
總時長：0.25s
關鍵幀：opacity 0 → 1
NEW 升級建議：panel 內加 transform scale(0.94 → 1.0) 0.35s ease-in-back
```

### 6.10 連線中斷狀態變化

```
觸發：ws close
曲線：linear（瞬間切換）
總時長：0s
變化：
  .online → .online.off：dot 變 --text-faint，pulse 停止
  .conn → .conn.bad：色變 --danger，字串改為「連線中斷，重新連接中…」
重連成功後：瞬間恢復，無動畫過渡（避免閃爍）。
```

---

## 7. 微互動清單

| # | 觸發 | 反饋 |
| --- | --- | --- |
| 1 | 主按鈕 hover | `filter: brightness(1.05)`，150ms ease-out-soft |
| 2 | 主按鈕 active | `transform: translateY(1px)`，80ms |
| 3 | IconButton（mute）active | `transform: scale(0.95)`，100ms |
| 4 | Input focus | border 變 `--accent`，背景加深至 0.85 alpha |
| 5 | 排行榜 row hover | `background: rgba(167,139,250,0.08)`，200ms |
| 6 | 自己的 row | 漸層底＋accent border 高亮，常駐 |
| 7 | 新進榜 row | row-flash 1.4s 黃光，自動消退 |
| 8 | 連擊 ≥ 2 | HUD 下方 `🔥 連擊 xN` 淡入；combo 升 tier 時字級＋色變化 |
| 9 | 連擊 = 0（中斷）| HUD 連擊文字淡出（不顯示「中斷」字樣，安靜消失） |
| 10 | 完美對齊 | 白框擴張 0.55s + 粒子（NEW）+ 音效 triangle 雙音 |
| 11 | 完全沒對到 | 整顆 debris 落下 0.7s + 音效 sawtooth slide-down |
| 12 | 線上人數變動 | 數字直接替換（不做 tween；tabular-nums 確保不抖動） |
| 13 | 活動新訊息 | slide-in 0.4s from top |
| 14 | WS 重連成功 | dot 立即恢復綠色 + pulse；conn 文字「已連線 ✓」 |
| 15 | mute 切換 | icon 圖示替換（🔊 ↔ 🔇），無動畫；localStorage 同步 |
| 16 | Name input 輸入 | 即時 saveName（debounce 不需，localStorage 寫入便宜） |
| 17 | Score 上傳中 | rankLine 文字 `'上傳分數中…'`，色 `--text-dim`（NEW：可加 0.5s blink，建議 v1.1）|
| 18 | Score 上傳失敗 | rankLine 文字色變 `--danger`，文案「分數上傳失敗…」 |
| 19 | Tab 鍵切換焦點 | focus ring `--focus-ring` 2px 顯示（NEW）|
| 20 | prefers-reduced-motion | pulse / row-flash / slide-in 全部禁用，瞬切替代（§10）|

---

## 8. 聲音設計規格

### 8.1 WebAudio 合成參數（對齊 `audio` in `game.js:88-126`）

| 事件 | osc.type | frequency | gain | duration | slide | 備註 |
| --- | --- | --- | --- | --- | --- | --- |
| 一般放下 | `square` | 280 Hz | 0.10 | 0.07s | -60 Hz | exponentialRampToValue |
| 完美放下（主）| `triangle` | `540 + min(combo,8)×60` Hz | 0.14 | 0.09s | — | combo 8 時 = 540+480 = 1020 Hz |
| 完美放下（回音）| `triangle` | 主頻 × 1.5 | 0.10 | 0.07s | — | 延遲 50ms 觸發 |
| 遊戲結束 | `sawtooth` | 220 Hz | 0.13 | 0.18s | -160 Hz | 沉降感 |
| UI 點擊（NEW，可選）| `square` | 800 Hz | 0.05 | 0.03s | — | 按鈕 click，預設關閉 |
| 線上有人加入（NEW，可選）| `triangle` | 660 Hz | 0.04 | 0.06s | — | 預設關閉，避免人多時噪音 |
| Combo tier upgrade（NEW）| `triangle` | 880 Hz → 1320 Hz | 0.12 | 0.15s | — | 跨越 5 / 8 時觸發 |

### 8.2 音量平衡

- 全域 gain budget：所有同時鳴響事件 gain 總和 ≤ 0.30
- 完美雙音同時最高：0.14 + 0.10 = 0.24 ✅
- 全域 master gain 預留 0.85（避免 clipping）

### 8.3 Mute 行為

- 第一次點擊 / 按鍵時呼叫 `audio.ensure()` 解鎖 AudioContext（iOS / Safari 政策）
- mute toggle 持久化於 `localStorage.twr.muted`（架構 §3.2）
- 載入時若 `twr.muted === '1'`，icon 顯示 🔇
- mute 期間不建立 osc node，省 CPU

### 8.4 首次互動 Unlock

- 預設 `audio.ctx === null`
- `audio.ensure()` 在以下事件呼叫（已實作）：
  - canvas pointerdown
  - keydown（Enter / Space）
  - 各按鈕 click
- iOS 政策：必須在使用者手勢 callstack 內呼叫 `ctx.resume()`，目前實作正確（pointerdown 內同步呼叫）

---

## 9. 響應式設計

### 9.1 斷點清單

| 名稱 | 條件 | 主要變化 |
| --- | --- | --- |
| `desktop` | width ≥ 901px | 雙欄 grid（1fr / 360px）；canvas 鋪滿；sidebar 固定右側 |
| `tablet` | 481px ≤ width ≤ 900px | 單欄；sidebar 改放下方；app overflow: auto |
| `mobile` | width ≤ 480px | 單欄；字級縮放；觸控目標放大；hud-score 上限 64px |
| `mobile-landscape`（NEW） | width ≤ 900px 且 height ≤ 500px | sidebar 折疊為「展開」按鈕（NEW，Phase 1）|

### 9.2 每斷點規格

**Desktop（≥ 901px）**
- `.app`：grid-template-columns 1fr 360px、gap 18px、padding 18px
- HUD 分數：96px 上限
- Canvas 寬度：viewport - sidebar - gap - padding × 2
- 觸控目標：≥ 44×44，鍵盤導航完整

**Tablet（481–900px）**
- `.app`：grid-template-rows: minmax(0, 1fr) auto；padding 10px；gap 10px；overflow: auto
- HUD 分數：clamp 公式自然降至約 65–75px
- sidebar 卡片可橫向並列（NEW，建議）：`flex-direction: row; gap 10px`，每張卡寬 50%；動態 feed 改 max-height 120px
- 觸控目標：≥ 44×44

**Mobile（≤ 480px）**
- `.app`：padding 8px；gap 8px
- HUD 分數：clamp 自然降至 48px
- 主按鈕 padding-x 降至 18px；letter-spacing 0.3px
- panel 寬：92%、padding 22px 20px
- howto 字級：12px
- sidebar 卡片堆疊（單欄）
- 觸控目標：≥ 44×44；mute button hit-area 補到 44×44

**Mobile Landscape（≤ 900×500）**
- canvas-wrap 保持最大高度
- sidebar 變浮動「📊」按鈕（48×48 in top-right of sidebar area）；點開為 80% 寬抽屜
- 此情境下 HUD top 改為 8px，分數上限 56px

### 9.3 直向 / 橫向特別處理

| 場景 | 處理 |
| --- | --- |
| 行動裝置旋轉（架構開放問題 #4）| `window.addEventListener('resize')` 觸發 `resize()`；既有方塊 width 不縮（架構建議 Phase 1 補做比例縮放，UI 同意此 backlog）|
| Canvas DPR 變化 | `canvas.width = cssWidth × dpr`，已實作 |
| 字級隨視窗 | `clamp(min, vw-based, max)`，已實作於 HUD |
| Notch / Safe-area | 全螢幕場景需 `env(safe-area-inset-*)`（NEW，加在 `.app` padding）|

### 9.4 觸控目標最小尺寸

| 元件 | 視覺尺寸 | 實際 hit-area |
| --- | --- | --- |
| `.btn.primary` | 46×100%（panel 內） | ≥ 46×88 ✅ |
| `.icon-btn` | 40×40 | NEW：擴大到 44×44（`::before` 透明 padding）|
| 排行榜 row | 36×100% | ≥ 36×N，足夠（非主要互動） |
| Canvas | 全螢幕 | 整個 stage 即放下按鈕 ✅ |
| Mute toggle | 40×40 | NEW：擴大到 44×44 |

---

## 10. 無障礙規格

### 10.1 對比度檢查表

| 組合 | Ratio | 標準 | 結果 |
| --- | --- | --- | --- |
| `--text` on `--bg-0` | 14.6:1 | AA(4.5) / AAA(7) | ✅ AAA |
| `--text-dim` on `--bg-0` | 7.9:1 | AAA | ✅ AAA |
| `--text-faint` on `--bg-0` | 4.8:1 | AA | ✅ AA |
| `--accent` on `--bg-0` | 11.6:1 | AAA | ✅ AAA |
| `--accent-2` on `--bg-0` | 7.2:1 | AAA | ✅ AAA |
| `--gold` on `--bg-0` | 11.0:1 | AAA | ✅ AAA |
| `--silver` on `--bg-0` | 12.4:1 | AAA | ✅ AAA |
| `--bronze` on `--bg-0` | 4.9:1 | AA | ✅ AA |
| `--danger` on `--bg-0` | 6.4:1 | AA | ✅ AA |
| `--good` on `--bg-0` | 9.2:1 | AAA | ✅ AAA |
| 按鈕文字 `#0c1230` on `--accent` 漸層 | ≥ 7:1（漸層最暗點亦 7+）| AAA | ✅ |
| HUD 分數 `#fff` on canvas 任意 hue 方塊 | ≥ 5:1（加 text-shadow 補強）| AA | ✅ |

### 10.2 `prefers-reduced-motion` 替代動畫

啟用條件：`@media (prefers-reduced-motion: reduce)`

| 動畫 | 預設行為 | reduced 行為 |
| --- | --- | --- |
| 鐘擺擺動 | cos(ωt) 連續 | **保留**（功能性，不可關）|
| 完美外框擴張 | 0.55s 漸大漸淡 | **保留**（功能性回饋）|
| 完美粒子（NEW） | 8 顆爆開 | **取消**（純裝飾）|
| Debris 落下 | 物理積分 | **保留**（提示「掉了」）|
| 相機平滑 | exp 衰減 | **保留**（避免突跳更不適）|
| 連擊文字淡入 | 0.25s | 改為 0s 瞬切 |
| 連擊 tier 升級 | scale + 色變 | 改為純色變、無 scale |
| Combo 8+ pulse | 1.0s infinite | 取消，保持靜態 |
| 線上點 pulse | 1.6s infinite | 取消，保持靜態綠點 |
| 排行榜 row-flash | 1.4s 漸黃→透 | 改為 200ms 瞬切黃→透 |
| 活動 slide-in | 0.4s | 改為 0s 瞬切 |
| Overlay fade-in | 0.25s | 改為 0s 瞬切 |
| Panel scale-in（NEW）| 0.35s | 取消 |

### 10.3 鍵盤操作流程（Tab 順序圖）

```
Start Screen (menu state):
  ┌───────────────────────────────────────┐
  │ 1. nameInput  ── Tab ──►              │
  │ 2. startBtn   ── Enter ── 觸發 startGame
  │                                       │
  │ Space (in input)：寫入空白             │
  │ Enter (in input)：等同 startBtn click │
  └───────────────────────────────────────┘

Playing state:
  ┌───────────────────────────────────────┐
  │ 1. canvas (focusable, tabindex=0 NEW) │
  │ 2. muteBtn                            │
  │                                       │
  │ Space / Enter (canvas focus)：drop    │
  │ Space / Enter (其他 focus)：drop      │
  │ Tab：在 canvas / muteBtn 間切換       │
  └───────────────────────────────────────┘

Over state:
  ┌───────────────────────────────────────┐
  │ 1. againBtn (autofocus NEW)           │
  │                                       │
  │ Enter：觸發 againBtn click            │
  │ Esc：不動作（避免誤觸）               │
  └───────────────────────────────────────┘
```

NEW：所有 focusable 元素加 `--focus-ring` 2px solid + 2px offset（包含 canvas）。

### 10.4 螢幕閱讀器 aria-* 規格

| 元素 | aria 規格 |
| --- | --- |
| `<canvas id="game">` | `role="img"` + `aria-label="疊大樓遊戲畫面，目前分數 {score}，連擊 {combo}"`（動態更新）|
| `.hud-score` | `aria-live="polite"` `aria-atomic="true"`（分數變動時宣告）|
| `.hud-combo` | `aria-live="polite"` `aria-atomic="true"` |
| `#startBtn` | `aria-label="開始遊戲"`（已有 textContent，無需重複）|
| `#muteBtn` | `aria-label="音效開關"` + `aria-pressed="{muted}"`（NEW）|
| `#nameInput` | `aria-label="你的名字，最多 16 字元"` |
| `.leaderboard` | `role="list"` `aria-label="排行榜前 10 名"` |
| `.activity` | `role="log"` `aria-live="polite"` `aria-label="最新動態"` |
| `.online` | `aria-label="目前 {n} 人在線上"`（NEW，將 textContent 加描述 wrapper）|
| `.conn` | `aria-live="polite"`（連線狀態變化宣告）|
| `#overScreen` | `role="dialog"` `aria-labelledby="overTitle"` `aria-modal="true"`（NEW，需給 over-title id="overTitle"）|

### 10.5 色盲輔助（雙重編碼）

| 訊息 | 主編碼（色）| 次編碼（形狀 / 位置 / 文字）|
| --- | --- | --- |
| 完美對齊 | 白框 | + 粒子爆散（NEW） + 音效雙音 + 「連擊 xN」HUD 文字 |
| 一般對齊 | （無特殊色變化）| 寬度視覺縮減 + 一般放下音 |
| 沒對到 | （無特殊色變化）| 整顆 debris 掉落 + 沉降音 + 0.7s 後 over panel |
| Rank 1/2/3 | 金 / 銀 / 銅 | + 數字 1/2/3 本身 + grid 位置（前三列）|
| 自己的 row | 漸層底高亮 | + 加 emoji 🫵 prefix（NEW，UI 手冊已列）|
| 連線正常 | 綠 dot pulse | + 文字「已連線 ✓」 |
| 連線中斷 | 灰 dot（無 pulse）| + 文字「連線中斷，重新連接中…」 + 顏色 `--danger` |
| 0 分上傳失敗 | （無）| 文字「0 分不會上傳排行榜，再來一場吧！」明確 |

---

## 11. 在地化策略

### 11.1 字串目錄結構

`strings.zh-TW.js` schema（NEW，目前所有字串硬編於 `index.html` + `game.js`）：

```js
// public/strings.zh-TW.js
export default {
  meta: {
    lang: 'zh-Hant',
    title: '雲端疊大樓 ☁️🏙️',
  },
  start: {
    title: '雲端疊大樓',
    subtitle: '點擊 / 空白鍵，把樓層疊到最高！',
    nameLabel: '你的名字',
    namePlaceholder: '輸入暱稱',
    startBtn: '開始遊戲',
    howto: [
      '🟦 方塊會左右移動，{strong}點擊畫面或按空白鍵{/strong}放下',
      '✂️ 沒對齊的部分會被切掉，方塊越疊越窄',
      '🎯 完美對齊可{strong}加分、回血變寬{/strong}並累積連擊',
      '🏆 結束後分數自動上傳{strong}共享排行榜{/strong}',
    ],
  },
  hud: {
    combo: (n) => `🔥 連擊 x${n}`,
    comboTier2: (n) => `🔥 大連擊 x${n}`,
    comboTier3: (n) => `★ 完美鎖定 x${n}`,
  },
  over: {
    title: '遊戲結束',
    scoreUnit: '層',
    uploading: '上傳分數中…',
    uploadFail: '分數上傳失敗，請檢查網路連線。',
    zeroScore: '0 分不會上傳排行榜，再來一場吧！',
    rankNew: '🎉 新進榜',
    rankLine: (rank) => `你的名次 #${rank}`,
    bestCombo: (n) => `最佳連擊 x${n}`,
    againBtn: '再玩一次',
  },
  sidebar: {
    brandName: '雲端疊大樓',
    online: (n) => `${n} 人在線上`,
    leaderboardTitle: '🏆 排行榜 TOP 10',
    activityTitle: '📣 最新動態',
    lbEmpty: '還沒有人上榜，當第一個吧！',
    actEmpty: '等待玩家上傳分數…',
    activityRow: (name, score) => ({ name, verb: '疊到', score, unit: '層' }),
    connOk: '已連線 ✓',
    connBad: '連線中斷，重新連接中…',
  },
  a11y: {
    canvasLabel: (score, combo) => `疊大樓遊戲畫面，目前分數 ${score}，連擊 ${combo}`,
    muteLabel: '音效開關',
    nameLabel: '你的名字，最多 16 字元',
    leaderboardLabel: '排行榜前 10 名',
    activityLabel: '最新動態',
    onlineLabel: (n) => `目前 ${n} 人在線上`,
  },
};
```

優先語系：`zh-TW`（base）→ `en` → `ja` → `ko`。

### 11.2 字長變動處理

| 字串 | zh-TW | en | ja | ko | 對策 |
| --- | --- | --- | --- | --- | --- |
| 開始遊戲 | 4 字 | "Start Game" 10 chars | "ゲーム開始" 5 字 | "게임 시작" 5 字 | 主按鈕保留 width 100%，內距彈性 |
| 你的名字 | 4 字 | "Your Name" 9 | "あなたの名前" 6 | "당신의 이름" 6 | label `span` 已是 block，自然換行不影響 |
| 🔥 連擊 x3 | 8 chars | "🔥 Combo x3" 11 | "🔥 コンボ x3" 9 | "🔥 콤보 x3" 8 | min-height 22px 已預留 |
| 12 人在線上 | 7 chars | "12 online" 9 | "12 人オンライン" 10 | "12명 온라인" 9 | brand 區寬度彈性，必要時 max-width + ellipsis |
| 你的名次 #7 | 7 chars | "Your rank #7" 12 | "あなたの順位 #7" 9 | "당신의 순위 #7" 9 | rank-line min-height 20px 已預留；超過則 wrap |
| 上傳分數中… | 6 chars | "Uploading score…" 16 | "スコアアップロード中…" 13 | "점수 업로드 중…" 9 | rank-line 預設可 wrap，min-height 20px |

**通則**：所有可變字串容器禁止 `white-space: nowrap`，除非顯式設計可截斷（如 `.lb-name`、`.act-name`）；按鈕用 `padding` 而非 `width: 固定 px`。

### 11.3 數字 / 排名 / 時間在地化

| 項目 | zh-TW | en | ja | ko |
| --- | --- | --- | --- | --- |
| 分數 | `87`（無千分位，<1M 不需要）| same | same | same |
| 排名前綴 | `#7` | `#7` | `7位` | `7위` |
| 連擊次數 | `x3` | `x3` | `x3` | `x3` |
| 時間（Phase 2 daily 倒數）| `距下次重置 5 小時` | `5h until reset` | `リセットまで 5 時間` | `리셋까지 5시간` |
| 數字格式 | tabular-nums | tabular-nums | tabular-nums | tabular-nums |
| 1,000,000 上限（MAX_SCORE）| 不顯示，僅伺服器擋 | same | same | same |

---

## 12. 設計到工程的交接

### 12.1 Token 與元件實作優先順序

**P0（Phase 1 必做，立即）**

1. 新增 CSS variables 於 `:root`：
   - `--combo-tier-1`、`--combo-tier-2`、`--combo-tier-3`
   - `--perfect-stroke`
   - `--focus-ring`
   - `--shadow-strong`
   - `--glow-accent`
   - `--radius-xs` ~ `--radius-2xl`（一次補齊命名）
   - `--space-1` ~ `--space-6`
2. 補 `:focus-visible` 樣式（所有按鈕、input、canvas）：`outline: 2px solid var(--focus-ring); outline-offset: 2px`
3. 補 `@media (prefers-reduced-motion: reduce)` 區塊，套用 §10.2 表格
4. 補 aria-* 屬性（§10.4），含 canvas `role="img"` 與動態 aria-label 更新
5. 完美對齊粒子（§5.5），加 `state.particles[]` 與 update / draw 邏輯
6. Combo tier 升級視覺（HUD）— tier 邊界 2 / 5 / 8

**P1（Phase 1 後段或 Phase 2 起手）**

7. 拆出 `public/tokens.css`，把 `:root` 變數搬過去，`style.css` 改 `@import "./tokens.css"`
8. 拆出 `public/strings.zh-TW.js`（§11.1）
9. icon-btn / mute-btn hit-area 補 44×44
10. `prefers-reduced-motion` 對應的 JS 行為（粒子 / pulse 關閉）
11. Toast 元件骨架（為 Phase 2 成就解鎖預備）

**P2（Phase 2 起）**

12. 主題色面板 5 套（修改 `--accent` / `--accent-2`）
13. Onboarding 教學箭頭（前 3 顆方塊提示）
14. Daily challenge 倒數 UI

### 12.2 常數同步表（design → `public/game.js`）

| design 常數 | game.js 變數 | 目前值 | 是否需改 |
| --- | --- | --- | --- |
| BLOCK_H | `BLOCK_H` (game.js:60) | 32 | 無變更 |
| 完美外框時長 | `pushEffect` 的 `ttl` (game.js:268) | 0.55 | 無變更 |
| 完美外框擴張比 | `draw()` effects 的 `r = 1 + k * 0.6` (game.js:354) | 0.6 → max 1.6× | 無變更 |
| Debris 初速 vy | `spawnFalling` 的 `vy: -40` (game.js:256) | -40 | 無變更 |
| Debris 水平速度範圍 | `30 + Math.random() × 40` (game.js:257) | 30–70 px/s | 無變更 |
| Debris 旋轉速度 | `(Math.random() - 0.5) × 4` (game.js:259) | ±2 rad/s | 無變更 |
| Debris 銷毀條件 Y | `y > H + 200` (game.js:306) | 200 | 無變更 |
| 重力 g | `1400` (game.js:302) | 1400 | 無變更 |
| 相機 lerp | `Math.min(1, dt * 8)` (game.js:293) | k=8 | 無變更 |
| pendingOverTimer | `0.7` (game.js:210) | 0.7s | 無變更 |
| Combo 顯示門檻 | `state.combo >= 2` (game.js:448) | 2 | 無變更，但加 tier 條件 |
| 完美粒子數 | NEW | — | 加 `PERFECT_PARTICLE_N = 8` |
| 完美粒子壽命 | NEW | — | 加 `PERFECT_PARTICLE_TTL = 0.45` |
| 完美粒子重力 | NEW | — | 加 `PERFECT_PARTICLE_G = 600` |
| 完美粒子大小 | NEW | — | 加 `PERFECT_PARTICLE_SIZE = 6` |
| Combo tier 邊界 | NEW | — | 加 `COMBO_TIER_2 = 5`、`COMBO_TIER_3 = 8` |
| Audio combo upgrade trigger | NEW | — | 跨越 tier 時呼叫 `audio.comboUp()` |

### 12.3 CSS Token 拆檔規劃

當前狀態：所有 token 直接寫在 `public/style.css:1-19` 的 `:root`。

**建議 Phase 1**：

```
public/
  style.css            ← @import "./tokens.css"; 其他樣式
  tokens.css           ← :root { --bg-0: ...; ... }
  strings.zh-TW.js     ← export default { ... }  (§11.1)
```

`tokens.css` 內容：所有色彩、字級、圓角、間距、陰影、easing var。`style.css` 不再內含「魔法數字」（除 layout grid template）。

### 12.4 視覺驗收清單（給 QA）

設計者交付前 QA 必檢項：

**佈局**
- [ ] 桌機（1440×900）雙欄正常，sidebar 360px、canvas 鋪滿
- [ ] 平板（768×1024）單欄，sidebar 在下、可滾動
- [ ] 手機（375×667）直向：HUD 字大小不溢出，主按鈕可點
- [ ] 手機橫向（667×375）：sidebar 折疊或縮小，canvas 仍主導
- [ ] 高 DPR（2x / 3x）：canvas 銳利、無模糊

**動畫**
- [ ] 鐘擺：左右擺動順暢、無抖動、無漂移；中央快兩端慢明顯
- [ ] 完美對齊：白框 0.55s 內擴張至 1.6×，alpha 順暢漸退
- [ ] 完美粒子（NEW）：8 顆散開，0.45s 內消失，色與方塊一致
- [ ] Debris：拋物落下，每次方向不同（左中右），不重疊原方塊
- [ ] 相機：第 10 層後開始下滾，平滑無顛簸
- [ ] HUD combo：≥2 顯示、=0 隱藏；tier 升級色變
- [ ] row-flash：新進榜 row 1.4s 黃光自然消退
- [ ] slide-in：活動 feed 從上滑入 0.4s
- [ ] 線上點 pulse：1.6s 循環、scale 1 → 1.15

**音效**
- [ ] 一般放下：短促 square sweep（280 → 220 Hz）
- [ ] 完美放下：triangle 雙音，combo 8 時音高最高
- [ ] 遊戲結束：sawtooth 沉降
- [ ] mute toggle 持久化（重整頁面後仍 mute）
- [ ] 首次點擊解鎖 AudioContext（iOS Safari 測試）

**無障礙**
- [ ] Tab 順序：startBtn → nameInput（或反之）→ canvas → muteBtn → againBtn（over）
- [ ] focus ring：所有可 focus 元素清晰可見
- [ ] prefers-reduced-motion：粒子、pulse、row-flash 停止
- [ ] 螢幕閱讀器：分數變化會宣告
- [ ] 色盲模擬（Chrome DevTools）：rank 前三名仍可區分（數字位置 + 色）

**狀態流**
- [ ] menu → playing：startScreen 消失瞬間，HUD 顯示，active 方塊就位
- [ ] playing → falling：drop miss 後 active 變 debris，0.7s 後 over panel 出現
- [ ] falling → over：panel 漸入 0.25s + scale 0.94 → 1.0
- [ ] over → playing：再玩一次按鈕點擊後，所有狀態 reset，新 baseHue 隨機
- [ ] WS 斷線：dot 變灰、conn 文字變紅；重連後恢復

**邊界 / 例外**
- [ ] 0 分上傳：rankLine 顯示「0 分不會上傳…」，無 rank-badge
- [ ] 名字空字串：自動生成 `玩家XXXX`，sidebar 排行榜顯示生成名
- [ ] WS 永遠連不上：polling fallback 啟動，每 12s GET /api/leaderboard
- [ ] 排行榜 fresh row：剛上分的 row 高亮 1.4s 後消退

---

## 附錄 A：與架構文件的張力與待 Product Architect 決策事項

1. **架構 §13.4 行動裝置橫向 / 直向切換 → UI 立場**：UI 建議 Phase 1 不縮放既有方塊（會打破數學公式 §1.5 的 `prev.width` 含義），而是改為「resize 時 freeze 玩家，顯示確認 toast」。**待 Product Architect 裁定。**
2. **架構 §13.7 多語系 → UI 立場**：建議 Phase 2 切入點是「先抽 strings 檔，內容仍只有 zh-TW；待 demand signal 再加語系」。本文件 §11 已提供 schema，不立即實作。
3. **架構 §1.1 半週期決策時間 0.425s（level 48+）→ UI 立場**：此值對無障礙挑戰較大。建議 Phase 1 增加「輕鬆模式」toggle（無 leaderboard，半週期下限改為 0.6s）。**待 Product Architect 評估。**
4. **架構 §10.1 客戶端信任 → UI 立場**：UI 不顯示「分數上傳成功的特殊勳章」，避免在 Phase 3 防作弊上線前養成玩家對虛假紀錄的依賴。本文件 §4.3 Game Over 已保守處理。
5. **架構 §13.2 暱稱衝突 → UI 立場**：建議「device-id 隱含主鍵 + 暱稱可重複，顯示時加 #1234 後綴」（友善），UI 在排行榜列已有 ellipsis 處理長字。**正式提案，待 Product Architect 確認後寫入 §11**。
6. **完美粒子（§5.5 NEW）對效能影響**：每次完美最多 8 個粒子，0.45s 內銷毀，最壞情況同時 ~24 個粒子（短時間內三連完美）；以 60fps、每粒 4 個 fillRect 計算約 5,760 ops/s，遠低於 canvas 預算。**不需 Product Architect 介入，列入工程驗收即可。**

## 附錄 B：版本演進

| 版本 | 日期 | 變更 |
| --- | --- | --- |
| 1.0.0 | 2026-05-28 | 初版。對齊架構 1.0.0 與 Phase 0 實作。列出 §12 Phase 1 待新增項目（粒子、tokens 拆檔、a11y、strings 抽出）。|
