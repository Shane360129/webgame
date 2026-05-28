# 雲端疊大樓 · 遊戲架構設計文件

> 本文件由「產品架構 Agent」維護，作為 UI Agent 與工程 Agent 實作的單一事實來源（SSOT）。本文件描述 Phase 0（已落地）與 Phase 1–3（規劃）的具體規格。所有數值皆為硬性規範，不可任意調整；如需調整必須回到本文件提案並更新。

- 文件版本：1.0.0
- 對應程式碼版本：`server.js` / `public/game.js`（commit time 2026-05-28）
- 對應 Node 版本：≥ 20

---

## 1. 遊戲概念形式化

### 1.1 Core Loop（單一場次）

```
       ┌──────────────────────────────────────────────────────┐
       │                                                      ▼
   生成 active 方塊 → 鐘擺擺動 → 玩家點擊放下 → 判定切割／完美 → 計分 + 推進相機
       ▲                                                      │
       │                                                      │
       └─────────────── 還沒掉光 ─────────────────────────────┘
                                       │
                                       ▼
                                完全沒對到 / 寬度歸零
                                       │
                                       ▼
                                 進入 falling state
                                       │
                                       ▼
                                   遊戲結束
                                       │
                                       ▼
                          上傳分數 → 排行榜 / 動態廣播
```

單次決策時間：玩家從看到 active 方塊到必須按下的時間 = 半個鐘擺週期（依層級在 0.425s ~ 1.5s）。

### 1.2 Game States（FSM）

| State | 進入條件 | 可接受輸入 | 離開到 |
| --- | --- | --- | --- |
| `menu` | 頁面載入 / 重新整理 | `Enter`、開始按鈕 | `playing` |
| `playing` | `startGame()` | `pointerdown`、`Space`、`Enter` | `falling` |
| `falling` | `drop()` 時 overlap ≤ 0 | 無 | `over`（延遲 0.7s）|
| `over` | falling 動畫結束 | `Enter`、再玩一次按鈕 | `playing` |

```
   ┌──────┐  start  ┌─────────┐  miss   ┌─────────┐  0.7s   ┌──────┐
   │ menu │ ──────► │ playing │ ──────► │ falling │ ──────► │ over │
   └──────┘         └─────────┘         └─────────┘         └──┬───┘
                          ▲                                    │
                          └────────── again ───────────────────┘
```

實作位置：`public/game.js` 的 `state.mode`（行 29）。

### 1.3 勝負條件

- **勝**：本遊戲無「勝利」終局，純粹刷分。每場次的目標是最大化 `score` 與 `bestCombo`。
- **負（場次結束）**：當玩家放下時 `overlap ≤ 0`（與前一層完全沒有重疊），active 方塊整塊掉落，進入 `falling`。
- 寬度退化至 `< MIN_WIDTH = 6 px` 不直接結束遊戲；玩家可繼續玩到 miss 為止（容許滑桿節奏奇蹟）。實作參考 `drop()` 行 242 的註解。

### 1.4 計分公式

設第 n 次成功放下的層為 `level n`，落差為 `delta_n = |cur.x − prev.x|`：

```
perfect_n = (delta_n ≤ PERFECT_TOL)        ; PERFECT_TOL = 4 px
combo_n   = combo_{n-1} + 1   if perfect_n
          = 0                 otherwise
score_n   = score_{n-1} + 1 + (min(combo_n, 8) if perfect_n else 0)
```

- 基本層分：每層 +1。
- 完美獎勵：額外 `+min(combo, 8)`。連擊上限封頂 8，避免單局分數爆量。
- `bestCombo = max_n(combo_n)`，僅用於顯示，不寫入伺服器。
- 0 分（完全沒放下任何方塊）**不上傳**排行榜（見 `showGameOver()` 行 481）。

### 1.5 回血公式（完美對齊）

```
placedWidth = min(baseWidth, prev.width + REGROW)     ; REGROW = 6 px
placedX     = clamp(prev.x − (placedWidth − prev.width) / 2,  0, W − placedWidth)
```

- 回血上限為 `baseWidth = min(W × 0.62, 300)`，即初始寬度。
- 重新置中以 `prev` 為基準，向兩側均勻拓寬。
- `placedX` clamp 至畫面內，避免拓寬導致漂移出邊界。

### 1.6 切割公式（非完美命中）

```
left        = max(cur.x, prev.x)
right       = min(cur.x + cur.width, prev.x + prev.width)
overlap     = right − left
placedX     = left
placedWidth = overlap
debris      = (cur 多出 prev 的那一截) → 拋出 falling
```

---

## 2. 鐘擺擺動數學規格

### 2.1 位置函數

active 方塊 x 座標為時間的純函數，無 numerical integration、無 drift：

```
x(t)   = span × (1 + side × cos(ω × t))
span   = max(0, (W − width) / 2)
ω      = 2π / period
t      = (now − t0) / 1000        ; 秒
```

- `side = -1` ⇒ `cos(0)=1 ⇒ x=0` ⇒ 從左邊起步、向右擺。
- `side = +1` ⇒ `cos(0)=1 ⇒ x=2span = W − width` ⇒ 從右邊起步、向左擺。
- 在 `drop()` 時刻會將 `cur.x = activeXAt(cur, performance.now())` 強制 snap，確保「視覺所見即下落位置」（零延遲輸入）。

### 2.2 起始邊

第 0 層（首方塊）為靜態地基；第 1 層開始為 active。`fromLeft = (level % 2 === 1)`：

- level 1：左邊起步
- level 2：右邊起步
- level 3：左邊起步
- …

奇偶交替提供節奏感與視覺對稱。

### 2.3 速度（推導）

```
dx/dt = − span × side × ω × sin(ω × t)
|dx/dt|_max = span × ω        （在 ω×t = π/2，即正中央）
|dx/dt|_min = 0               （在 ω×t = 0 或 π，即兩端）
```

物理感：中央最快、兩端瞬時靜止，符合鐘擺手感（與等速線性差異是「兩端有可以瞄準的甜蜜停頓」）。

### 2.4 常數總覽

| 常數 | 值 | 位置 | 意義 | 調高 / 調低影響 |
| --- | --- | --- | --- | --- |
| `BLOCK_H` | `32` (px) | `game.js:60` | 方塊固定高度，也決定相機推進步距 | 調高：方塊變粗，畫面進度感變強，可見層數減少 |
| `PERFECT_TOL` | `4` (px) | `game.js:61` | 完美判定容忍度 | 調高：完美太簡單，連擊容易爆衝；調低：高層幾乎無法完美 |
| `REGROW` | `6` (px) | `game.js:62` | 完美對齊回血幅度 | 調高：完美收益極高，遊戲時間拉長；調低：完美僅有分數獎勵 |
| `FLOOR_INSET` | `50` (px) | `game.js:63` | 地板距畫面底部留白 | 調高：底部 HUD/UI 空間大；不影響玩法 |
| `ACTIVE_TARGET_FRAC` | `0.30` | `game.js:64` | active 方塊在畫面 30% 高處時相機推進 | 調低：較早推進相機，視覺更穩定；調高：方塊更靠近天花板才推進 |
| `MIN_WIDTH` | `6` (px) | `game.js:65` | 方塊寬度下限（僅註解用） | 寬度低於此值不結束遊戲，僅作展示語意 |
| `baseWidth(W)` | `min(W × 0.62, 300)` | `game.js:67` | 首方塊寬度 / 回血上限 | 桌機畫面寬時被 300 限制，移動裝置依比例縮放 |
| `periodFor(level)` | `max(0.85, 3.0 − level × 0.045)` | `game.js:70-74` | 第 N 層的鐘擺週期（秒） | 改 0.045：每層加速幅度；改 0.85：最快上限；改 3.0：起手週期 |
| `NAME_MAX` | `16` (字元) | `server.js:14` | 暱稱上限 | 影響 DB 儲存與 UI 排版 |
| `MAX_SCORE` | `1_000_000` | `server.js:13` | 單次上傳分數上限（防作弊預先閘） | 調低：作弊成本上限；過低會擋到極限玩家 |
| `name` field | UTF-8 string, trimmed | `server.js:54` | 過濾 `\x00-\x1F\x7F<>` 與空白摺疊 | 影響排行榜顯示安全性（XSS 邊界） |
| HUD combo 顯示閾值 | `combo >= 2` | `game.js:448` | 連擊 HUD 出現門檻 | 調高：UI 更冷靜；調低：每層完美都閃 |
| `pendingOverTimer` | `0.7` (s) | `game.js:210` | miss → over 之間的動畫緩衝 | 調高：玩家有更多時間「看殘骸掉」；調低：流程更緊湊 |

### 2.5 週期表（取樣）

| level | period (s) | 半週期（決策時間，s）|
| --- | --- | --- |
| 1 | 2.955 | 1.478 |
| 5 | 2.775 | 1.388 |
| 10 | 2.550 | 1.275 |
| 20 | 2.100 | 1.050 |
| 30 | 1.650 | 0.825 |
| 40 | 1.200 | 0.600 |
| 48 | 0.840 → 0.850（clamp） | 0.425 |
| 50+ | 0.850 | 0.425 |

第 48 層後鐘擺週期到下限 0.85s（半週期 0.425s），之後僅靠寬度收縮提高難度。

---

## 3. 多人模型

### 3.1 模型總覽

設計選擇：**「各自遊玩 + 共享狀態」**。每位玩家在自己的瀏覽器中跑獨立的場次（local game loop），伺服器只負責：
1. 持久化每場遊戲結束時的「最終分數」一筆紀錄。
2. 廣播「線上人數」與「最新動態」給所有連線者。
3. 維護全域 Top N 排行榜。

不需要的東西（避免實作）：lockstep simulation、權威伺服器物理、玩家對玩家互動、即時對手 cursor。

### 3.2 資料邊界

| 範疇 | 獨立（per-player）| 共享（global） |
| --- | --- | --- |
| 鐘擺擺動相位 | ✅ 客戶端各自隨機 (`Math.random()` baseHue + `performance.now()` t0) | ❌ |
| 當前場次的方塊堆、分數、連擊 | ✅ 客戶端 state | ❌ |
| 暱稱 | ✅ 客戶端 `localStorage` (`twr.name`) | ✅ DB scores.name |
| 排行榜 Top N | ❌ | ✅ |
| 線上人數 | ❌ | ✅（WS clients count） |
| 動態 feed（recent activity）| ❌ | ✅（廣播事件流，非持久化） |
| 音效靜音偏好 | ✅ `localStorage` (`twr.muted`) | ❌ |

### 3.3 一致性等級

- **強一致**：排行榜寫入（SQLite synchronous，單一 writer）。
- **最終一致**：線上人數（heartbeat 每 30 秒重算 + 連線開關事件廣播），可能有 ±1 秒誤差。
- **盡力而為**：動態 feed（純廣播，不重送，斷線者錯過就錯過）。

### 3.4 並發場景

兩位玩家「幾乎同時」上傳分數：

1. Express 單執行緒事件迴圈，`POST /api/score` 互斥執行（Node.js 非阻塞 I/O 在 SQLite 同步呼叫期間實際是序列化的）。
2. `better-sqlite3` 同步寫入，WAL 模式下 reader 不被阻塞。
3. 兩次寫入後各自觸發 `broadcast({type:'leaderboard'})` 與 `broadcast({type:'activity'})`，順序為先後到達順序，所有 client 看到的順序一致。

---

## 4. 系統元件圖

```
┌───────────────────────────────────────────────────────────────────────┐
│ Browser                                                               │
│ ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                │
│ │ Canvas       │   │ Sidebar UI   │   │ WebSocket    │                │
│ │ game.js loop │   │ Leaderboard  │   │ client       │                │
│ │ FSM + render │   │ Activity     │   │ + polling    │                │
│ └──────┬───────┘   └──────┬───────┘   └──────┬───────┘                │
│        │ user input        │ DOM update       │ JSON msgs              │
│        ▼                   ▲                  ▲                        │
│ ┌──────────────────────────────────────────────────────┐               │
│ │  state{} + handleWS() + renderLeaderboard()          │               │
│ └──────────────────────────────────────────────────────┘               │
│                                  │                                     │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │ HTTP / WS
                                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Node.js 進程 (server.js)                                              │
│ ┌────────────────────────┐  ┌────────────────────────┐                │
│ │ Express App            │  │ ws.WebSocketServer     │                │
│ │  - static /public      │  │  - path: /ws           │                │
│ │  - GET  /healthz       │  │  - heartbeat 30s       │                │
│ │  - GET  /api/lb        │  │  - clients Set         │                │
│ │  - POST /api/score     │  │                        │                │
│ └──────────┬─────────────┘  └────────────┬───────────┘                │
│            │                              │                            │
│            │ insertScore / getTop         │ broadcast()                │
│            ▼                              ▼                            │
│ ┌──────────────────────────────────────────────────────┐               │
│ │  better-sqlite3 (WAL, synchronous)                   │               │
│ │   prepared: insertScore, selectTop, countBetter      │               │
│ └──────────────────────┬───────────────────────────────┘               │
└────────────────────────┼─────────────────────────────────────────────┘
                         ▼
                ┌────────────────────┐
                │ /data/leaderboard.db│
                │ + leaderboard.db-wal│
                │ + leaderboard.db-shm│
                └────────────────────┘
```

### 4.1 各元件職責

| 元件 | 職責 | 不負責 |
| --- | --- | --- |
| Browser Canvas | 渲染、輸入、本地物理（鐘擺、掉落動畫） | 持久化、廣播 |
| Browser Sidebar | 顯示 Top 10、動態、線上人數 | 計算排名 |
| Browser WS client | 訂閱 server push、自動重連、polling fallback | 推送遊戲中狀態 |
| Express | 靜態檔、REST API、健康檢查 | 即時推播 |
| ws Server | 連線管理、broadcast、heartbeat | DB 寫入 |
| better-sqlite3 | scores 表 CRUD、排名查詢 | 邏輯校驗 |

### 4.2 資料流（高階）

- **GET 排行榜**：Browser → Express → SQLite SELECT → JSON 回應。
- **POST 分數**：Browser → Express → SQLite INSERT → 廣播 leaderboard + activity → 所有 WS clients。
- **WS connect**：Browser → ws upgrade → 立即收 `init` → 加入 `wss.clients` Set。
- **WS broadcast**：`broadcast()` 迭代 `wss.clients`，每個 `readyState === 1` 的 client `.send(msg)`。

---

## 5. 完整資料模型

### 5.1 Phase 0 現況

```sql
CREATE TABLE scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  created_at INTEGER NOT NULL   -- ms epoch
);
CREATE INDEX idx_scores_score ON scores (score DESC, created_at ASC);
```

- `name`：經 `sanitizeName()` 過濾後寫入，最大 16 字元，不允許控制字元與 `<>`。
- `score`：0 ≤ score ≤ 1,000,000；超出範圍會被 `POST /api/score` 擋下。
- `created_at`：伺服器側 `Date.now()`，毫秒。
- 排名 tie-break：score 相同時 `created_at` 早者排前。
- WAL 模式啟用：`db.pragma('journal_mode = WAL')`。

### 5.2 Phase 2 規劃

```sql
-- 玩家
CREATE TABLE players (
  id            TEXT PRIMARY KEY,        -- cookie-bound UUID v4
  display_name  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  best_score    INTEGER NOT NULL DEFAULT 0,
  total_runs    INTEGER NOT NULL DEFAULT 0,
  total_perfects INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_players_best ON players (best_score DESC);

-- 場次
CREATE TABLE runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    TEXT NOT NULL REFERENCES players(id),
  score        INTEGER NOT NULL,
  blocks       INTEGER NOT NULL,
  perfects     INTEGER NOT NULL,
  best_combo   INTEGER NOT NULL,
  started_at   INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_runs_player ON runs (player_id, created_at DESC);
CREATE INDEX idx_runs_score_time ON runs (score DESC, created_at ASC);
CREATE INDEX idx_runs_daily ON runs (created_at, score DESC); -- daily leaderboard
```

### 5.3 Migration 流程（Phase 0 → Phase 2）

1. 部署新版前先 `cp /data/leaderboard.db /data/leaderboard.db.bak.<timestamp>`。
2. 啟動時偵測 schema 版本：
   ```js
   db.exec('CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT);');
   const v = db.prepare("SELECT value FROM _meta WHERE key='schema_version'").get()?.value || '0';
   ```
3. v0 → v1：建立 `players`、`runs`，並一次性把 `scores` 內所有列產生 anonymous player（`id = 'legacy:' + scores.id`，`display_name = scores.name`），同時為每筆 score 建一筆對應 run。
4. 寫入 `_meta.schema_version = '1'`。
5. 保留 `scores` 表（不 DROP），下個版本確認穩定後再清理。

### 5.4 Index 策略

| 查詢 | 使用 index |
| --- | --- |
| Top 10 | `idx_scores_score` |
| 排名計算 `COUNT(*) WHERE score > ?` | `idx_scores_score` |
| 每日榜 | Phase 2 `idx_runs_daily` |
| 玩家歷史 | Phase 2 `idx_runs_player` |

---

## 6. API 規格（窮舉）

### 6.1 共通

- Base URL：`/`
- Content-Type：`application/json; charset=utf-8`
- 所有錯誤回應形式：`{ "ok": false, "error": "<message>" }`
- Request body 大小上限：`8kb`（`express.json({ limit: '8kb' })`）。
- 不需要 CORS（同源），未來如需跨網域可加 `cors` middleware。

### 6.2 GET `/healthz`

| 屬性 | 值 |
| --- | --- |
| Method | GET |
| Path | `/healthz` |
| Query | — |
| Body | — |
| 成功 200 | `{ "ok": true, "online": <int>, "total": <int> }` |

`online` 為當前 WS 連線數，`total` 為 scores 表總列數。Dockerfile healthcheck 應使用此 endpoint。

### 6.3 GET `/api/leaderboard`

| 屬性 | 值 |
| --- | --- |
| Method | GET |
| Path | `/api/leaderboard` |
| Query | `limit` — int, 1 ≤ limit ≤ 50，預設 10；非數字會被 fallback 為 10 |
| Body | — |
| 成功 200 | `{ "entries": Entry[], "online": <int> }` |

`Entry` schema：
```jsonc
{
  "rank": 1,                 // 1-indexed
  "name": "玩家A",
  "score": 87,
  "createdAt": 1748400000000 // ms epoch
}
```

錯誤：本 endpoint 不會回 4xx；異常時內部捕獲後仍回 200 空陣列（目前無 try/catch，5xx 由 Express default error handler 處理）。

### 6.4 POST `/api/score`

| 屬性 | 值 |
| --- | --- |
| Method | POST |
| Path | `/api/score` |
| Query | — |
| Body | `{ "name": string, "score": number }` |

Body 詳細：
- `name`：optional；不存在/空字串/非字串 → 套用 `'匿名玩家'`。長度截至 16 字元。
- `score`：required；轉 `Math.floor(Number(score))`；NaN/負數/> 1,000,000 → 400。

成功 200：
```jsonc
{
  "ok": true,
  "rank": 7,
  "score": 87,
  "name": "玩家A",
  "entries": Entry[]   // 上傳後最新 Top 10
}
```

錯誤 400：
```jsonc
{ "ok": false, "error": "invalid score" }
```

副作用：
1. 寫入 `scores` 一列。
2. 廣播 `{ type: "leaderboard", entries }`。
3. 廣播 `{ type: "activity", name, score, rank }`。

### 6.5 HTTP 狀態碼表

| Code | 用途 |
| --- | --- |
| 200 | 一切正常 |
| 400 | Body 驗證失敗（目前僅 `POST /api/score` 會出） |
| 404 | 未知路徑（Express default） |
| 413 | Body > 8kb（Express body-parser） |
| 500 | 內部錯誤（DB I/O 異常等） |

### 6.6 錯誤碼字串清單

| `error` 字串 | 來源 | 觸發條件 |
| --- | --- | --- |
| `invalid score` | `POST /api/score` | score 非有限數 / < 0 / > 1,000,000 |

Phase 1 將新增：

| `error` | 觸發 |
| --- | --- |
| `rate limited` | 同 IP 在 60 秒內超過 6 次 POST /api/score（HTTP 429） |
| `payload too large` | Body > 8kb（HTTP 413，已存在） |

### 6.7 Phase 2+ 預定新增

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/leaderboard?period=daily\|weekly\|all&limit=N` | 期間榜 |
| GET | `/api/player/:id/stats` | 玩家統計 |
| POST | `/api/run` | 上傳完整 run log（Phase 3 防作弊） |

---

## 7. WebSocket 協定規格

### 7.1 連線

- URL：`{ws|wss}://<host>/ws`
- 升級協議：HTTP/1.1 → WebSocket
- 子協議：無
- 認證：無（Phase 2 將以 cookie 帶 player id）

### 7.2 訊息格式

所有訊息為 JSON 物件，必含 `type` 欄位。

#### 7.2.1 Server → Client

`init`（連線時，server 主動發）
```jsonc
{
  "type": "init",
  "online": 12,
  "entries": Entry[]    // Top 10
}
```

`online`（線上人數變動）
```jsonc
{
  "type": "online",
  "online": 13
}
```

`leaderboard`（有人上分後）
```jsonc
{
  "type": "leaderboard",
  "entries": Entry[]
}
```

`activity`（有人完成一場）
```jsonc
{
  "type": "activity",
  "name": "玩家A",
  "score": 87,
  "rank": 7
}
```

`pong`（回應 client ping）
```jsonc
{ "type": "pong" }
```

#### 7.2.2 Client → Server

`ping`（可選，由 client 主動）
```jsonc
{ "type": "ping" }
```

其他 client 訊息會被忽略（伺服器不關心）。

### 7.3 訊息生命週期

```
   Client                          Server
     │                                │
     │ ─── WS upgrade ──────────────► │
     │                                │ broadcastOnline()
     │ ◄── { type:"init", ... } ───── │
     │ ◄── { type:"online", ... } ─── │
     │                                │
     │ ─── { type:"ping" } ─────────► │
     │ ◄── { type:"pong" } ────────── │
     │                                │
     │ ◄── { type:"leaderboard" } ─── │ ← 任意玩家上傳分數時
     │ ◄── { type:"activity" } ────── │
     │                                │
     │ ◄── ping frame (every 30s) ─── │ heartbeat
     │ ─── pong frame ──────────────► │
     │                                │
     │ ─── close ─────────────────────│ broadcastOnline()
```

### 7.4 心跳機制

- 伺服器：每 30 秒 `wss.clients` 全掃描，發送 WS ping frame，若上輪沒收到 pong 則 `ws.terminate()`。同時 `broadcastOnline()` 同步線上人數。
- 客戶端：可發 `{type:"ping"}` 應用層訊息檢測 server 活著（非必要）。
- 斷線判定：伺服器 60 秒內未收到 pong → terminate。

### 7.5 斷線重連策略（客戶端）

實作於 `game.js:551-591`：

| 行為 | 規格 |
| --- | --- |
| 初始 backoff | 1000 ms |
| 退避倍率 | x2 |
| 最大 backoff | 15000 ms |
| 連線成功 | reset backoff 至 1000 ms |
| 失敗 fallback | 切換為 12 秒一次的 polling (`GET /api/leaderboard`) |
| 重連成功 | 停止 polling |

### 7.6 廣播保證

- **At-most-once**：訊息送出後不重試，斷線者錯過。
- **順序**：同一個 server 進程內，broadcast 順序與 `wss.clients` iteration 順序一致；對單一 client 而言訊息順序為 FIFO。
- **去重**：無；客戶端需自行容忍重複（目前實作下不會發生重複）。

---

## 8. 關鍵流程 Sequence Diagram

### 8.1 玩家進入頁面 → active 方塊開始擺動

```
Browser                       Express                      ws Server         SQLite
  │ GET /                       │                            │                 │
  │ ──────────────────────────► │                            │                 │
  │ ◄── index.html ──────────── │                            │                 │
  │ GET /style.css /game.js     │                            │                 │
  │ ──────────────────────────► │                            │                 │
  │ ◄── static ──────────────── │                            │                 │
  │                             │                            │                 │
  │ DOMContentLoaded            │                            │                 │
  │ load name from localStorage │                            │                 │
  │                             │                            │                 │
  │ WS upgrade /ws              │                            │                 │
  │ ─────────────────────────── │ ─────────────────────────► │                 │
  │                             │                            │ wss.clients.add │
  │                             │                            │ getTop(10) ──► │
  │                             │                            │ ◄── entries ── │
  │ ◄── {type:"init", ...} ──── │ ◄────────────────────────  │                 │
  │ ◄── {type:"online",...} ─── │ ◄── broadcastOnline() ──── │                 │
  │                             │                            │                 │
  │ refreshLeaderboard()        │                            │                 │
  │ GET /api/leaderboard        │                            │                 │
  │ ──────────────────────────► │ ───── selectTop(10) ─────────────────────► │
  │ ◄── entries ─────────────── │ ◄────────────────────────────────────────  │
  │                             │                            │                 │
  │ user clicks Start           │                            │                 │
  │ startGame() → state.mode='playing'                       │                 │
  │ spawnActive(baseWidth) → set t0 = performance.now()      │                 │
  │ requestAnimationFrame → activeXAt() renders pendulum     │                 │
```

### 8.2 點擊放下 → 判定 → 渲染

```
Browser                                Canvas
  │ pointerdown event                     │
  │ e.preventDefault()                    │
  │ onPrimary() → drop()                  │
  │ cur.x = activeXAt(cur, now())  ← snap │
  │                                       │
  │ overlap = computeOverlap(cur, prev)   │
  │   if overlap <= 0:                    │
  │     spawnFalling(cur)                 │
  │     state.mode = 'falling'            │
  │     pendingOverTimer = 0.7s           │
  │     audio.gameOver()                  │
  │     return                            │
  │                                       │
  │   delta = |cur.x − prev.x|            │
  │   perfect = delta ≤ PERFECT_TOL       │
  │   if perfect:                         │
  │     combo += 1                        │
  │     placedWidth = min(baseW, prev.w + REGROW)
  │     placedX     = recenter            │
  │     pushEffect()  ← perfect flash     │
  │   else:                               │
  │     combo = 0                         │
  │     placedX     = max(cur.x, prev.x)  │
  │     placedWidth = overlap             │
  │     spawnFalling(overhang side)       │
  │                                       │
  │ blocks.push({...})                    │
  │ score += 1 + (perfect ? min(combo,8):0)
  │ audio.place(perfect, combo)           │
  │ updateHud()                           │
  │ spawnActive(placedWidth)              │
  │                                       │
  │ next rAF tick:                        │
  │   update(dt): camera lerps toward     │
  │     targetActiveY                     │
  │   draw(): bg → stars → blocks →       │
  │           active → effects → debris   │
```

### 8.3 遊戲結束 → 上傳分數 → 廣播 → 其他玩家看到

```
Browser A                Express                   ws Server          SQLite           Browser B
  │ state.mode='over'      │                          │                  │                 │
  │ showGameOver()         │                          │                  │                 │
  │ POST /api/score        │                          │                  │                 │
  │ {name:"A", score:87}   │                          │                  │                 │
  │ ─────────────────────► │                          │                  │                 │
  │                        │ sanitizeName()           │                  │                 │
  │                        │ validate score           │                  │                 │
  │                        │ insertScore.run(...)     │                  │                 │
  │                        │ ──────────────────────────────────────────► │                 │
  │                        │ ◄────────────────────────────────────────── │                 │
  │                        │ rank = countBetter+1     │                  │                 │
  │                        │ entries = getTop(10)     │                  │                 │
  │                        │ broadcast(leaderboard)  ►│                  │                 │
  │                        │ broadcast(activity)     ►│                  │                 │
  │                        │                          │ for each client: │                 │
  │                        │                          │   client.send()  │                 │
  │                        │                          │ ───────────────────────────────────►│
  │ ◄── 200 {ok,rank,...}─ │                          │                  │                 │
  │ rankLine 顯示「#7」    │                          │                  │                 │
  │ renderLeaderboard()    │                          │                  │ renderLeaderboard()
  │                        │                          │                  │ addActivity(msg)
```

---

## 9. 持久化、回復、重置

### 9.1 DB 位置

- 容器內：`/data/leaderboard.db`（`DB_PATH` 環境變數可覆寫）
- 本機開發：`./data/leaderboard.db`
- WAL 副檔案：`leaderboard.db-wal`、`leaderboard.db-shm`（自動產生，**備份時必須一併複製**）

### 9.2 啟動行為

1. `mkdirSync(dirname(DB_PATH), { recursive: true })` 確保目錄存在。
2. `new Database(DB_PATH)` 開啟連線（檔案不存在會自動建立空 DB）。
3. 啟用 WAL：`pragma('journal_mode = WAL')`。
4. `CREATE TABLE IF NOT EXISTS scores ...`：冪等。
5. 開始 listen。

### 9.3 關閉 / 重啟行為

- `SIGTERM` / `SIGINT` 觸發 `shutdown()`：清掉 heartbeat、`server.close()`、`db.close()`，最多等 5 秒強制退出。
- WAL checkpoint：`db.close()` 會自動 checkpoint，將 wal 內容寫回主檔。
- 重啟後排行榜完整保留（前提是 `/data` 為持久化 volume）。

### 9.4 備份策略

| 場景 | 操作 |
| --- | --- |
| 線上熱備 | `sqlite3 /data/leaderboard.db ".backup /data/backup-$(date +%F).db"` |
| 冷備 | 停服後 `tar czf` 整個 `/data/` |
| 還原 | 停服 → 複製 backup 檔覆蓋 `leaderboard.db` → 刪除 `.db-wal`、`.db-shm` → 啟動 |
| 頻率建議 | Phase 0 每日一次足夠（資料量 < 1MB） |

### 9.5 資料保留政策

- Phase 0：永久保留所有 scores。
- Phase 2：保留所有 runs；考慮對 1 年前的 runs 做摘要化（保留最佳分數，刪除明細）。
- 玩家刪除：Phase 2 提供 `DELETE /api/player/:id` 以滿足隱私請求（GDPR-style），實作為硬刪 players + 將其 runs 的 `player_id` 設為 NULL 並 anonymize。

### 9.6 重置

手動重置（管理員）：

```bash
docker exec tower sqlite3 /data/leaderboard.db "DELETE FROM scores;"
# 或直接刪除檔案後重啟
```

Phase 1 規劃：每日 UTC 00:00 對「daily 榜」做邏輯切換（不刪資料，改為以 `created_at` 範圍查詢）。

---

## 10. 防作弊策略

### 10.1 現況（Phase 0）

- 完全信任客戶端：score 由 JS 計算後 POST 上傳。
- 唯一防線：
  - `MAX_SCORE = 1,000,000` 上限
  - `sanitizeName()` 過濾控制字元與 `<>`，避免 XSS
  - Body 8kb 上限
- 已知可繞過：`fetch('/api/score', {method:'POST', body:JSON.stringify({name:'A',score:999999})})`

### 10.2 Phase 1：基本緩解

- IP-based rate limit：60s 內 ≤ 6 次 POST /api/score（in-memory map）。
- 過快上分啟發式：兩次 POST 間隔 < 3 秒視為可疑，記 log，不阻擋。

### 10.3 Phase 3：Run log 驗算（藍圖）

客戶端在每次 drop 時記錄：
```jsonc
{
  "t": 1234,           // ms since start
  "level": 5,
  "x": 123.4,          // drop x
  "active_x": 120.1,   // 鐘擺位置（snap 後）
  "perfect": true,
  "score": 12
}
```

上傳格式：
```jsonc
POST /api/run
{
  "name": "玩家A",
  "started_at": 1748400000000,
  "duration_ms": 45123,
  "seed": 12345,        // baseHue 等隨機種子
  "events": Event[]
}
```

伺服器驗算：
1. 重放 pendulum：以 seed + t0 + periodFor 重建 `activeXAt(t)`，與 client 上報的 `active_x` 比對誤差 ≤ 0.5 px。
2. 計分公式重算，score 必須與 client 上報的最終分數一致。
3. 兩次 drop 間隔須 ≥ 100 ms（人類反應極限）。
4. duration_ms 與 events 數量交叉檢查。

不通過：丟棄，回 422，並把 IP 標記為「需要進一步驗證」。

---

## 11. 規模與擴展

### 11.1 單機極限估算

假設 4 vCPU / 8GB RAM / SSD：

| 維度 | 估算 |
| --- | --- |
| WS 同時連線 | ~5,000（Node + ws 在這個規模穩定，記憶體 ~200MB） |
| `POST /api/score` QPS | ~2,000（SQLite 同步寫入 ~0.5ms 一筆，broadcast O(N) clients） |
| broadcast 開銷 | N 個 client × JSON.stringify + send，5,000 connections 下 ~30ms 一次 |
| DB 大小成長 | 一筆 ~80 bytes，10 萬筆約 8MB；100 萬筆 80MB |
| DB 讀取 QPS | SELECT TOP 10：~50,000（覆蓋索引，無 I/O） |

非功能目標（charter 規定）：WS 同時連線 ≥ 500、可用率 ≥ 99% — **遠低於單機極限**，Phase 0 ~ Phase 2 都安全。

### 11.2 升級觸發點

| 觸發條件 | 對應升級 |
| --- | --- |
| WS 同時連線 > 3,000 持續 1 週 | 拆 ws server 為獨立進程，前面加 sticky-session LB |
| DB > 500MB | 評估遷移至 PostgreSQL |
| POST QPS > 500 | 啟用 in-memory write buffer + 批次 flush |
| 需要跨地域低延遲 | 多 region 部署，DB master-slave + Redis Pub/Sub |

### 11.3 橫向擴展的廣播挑戰

Phase 0 假設「單一進程」即可廣播。多進程後問題：

1. 進程 A 收到 score → 進程 A 的 ws clients 收到推送 → 進程 B 的 clients 沒收到。
2. 解法：引入 Redis Pub/Sub 作為廣播匯流排。
   ```
   Process A: insertScore → redis.publish('lb', msg)
   Process A & B: redis.subscribe('lb') → broadcast to local ws.clients
   ```
3. 線上人數需改為 Redis SET（cookie/ws-id 為 member）或定期 SUM。

### 11.4 DB 切換到 PostgreSQL 的衝擊

- `better-sqlite3` 同步 API → `pg` 非同步，所有 endpoint 需改為 `async`。
- 排名查詢可改用 `RANK() OVER (...)` 視窗函式。
- 預期效能：與 SQLite 接近（這個規模 DB 不是瓶頸），主要益處是多進程共享。

---

## 12. 階段交付

### 12.1 Phase 0 — MVP（已完成）

**交付物**：
- [x] `server.js`：Express + ws + better-sqlite3
- [x] `public/index.html` `public/game.js` `public/style.css`
- [x] `Dockerfile`（含 healthcheck、non-root user）
- [x] `README.md`：部署指引
- [x] WebSocket：init / online / leaderboard / activity

**對應檔案**：
- 後端：`/home/user/webgame/server.js`
- 前端：`/home/user/webgame/public/`
- 部署：`/home/user/webgame/Dockerfile`、`/home/user/webgame/package.json`

### 12.2 Phase 1 — 體驗強化

**交付物清單**：
- [ ] 個人最佳分數 localStorage（key: `twr.best`）+ 開始畫面顯示
- [ ] 完美對齊計數器（HUD 右側）+ 結算畫面顯示 `bestCombo` 與 `perfects`
- [ ] 連擊回血粒子（UI Agent 負責視覺）
- [ ] 排行榜 Top 50 + 滾動加載（API 已支援 `limit=50`）
- [ ] 每日榜（`GET /api/leaderboard?period=daily`，UTC 00:00 切換）
- [ ] IP rate limit middleware（60s ≤ 6 次）

**範圍估算**：3–5 個工程日。

**依賴**：無外部依賴，純前後端改動。

### 12.3 Phase 2 — 留存

**交付物清單**：
- [ ] `players` 表 + `runs` 表 + migration
- [ ] cookie-bound player id（首訪 set-cookie，UUID v4）
- [ ] 暱稱去重：建立 `players.display_name UNIQUE` 或 server-side 加 4 位隨機後綴
- [ ] `GET /api/player/:id/stats`
- [ ] 成就系統：5 連完美 / 50 層 / 100 局（runs 表計算）
- [ ] 主題色面板（5 套，存 localStorage `twr.theme`）
- [ ] Daily challenge：每天種子 (`yyyymmdd` hash) 決定 baseHue 與 periodFor 修正

**範圍估算**：8–12 個工程日。

**依賴**：
- DB schema migration（不能讓既有玩家斷檔）
- 設計協作（成就圖標、主題色 → UI Agent）

### 12.4 Phase 3 — 競技與社群

**交付物清單**：
- [ ] 房間制：URL `?room=ABCD`，伺服器維護 room 內成員列表，分別廣播
- [ ] `POST /api/run` 完整 log 上傳 + 伺服器驗算（見 §10.3）
- [ ] OG image generation：`/og/score/:id.png` 動態產生 1200x630 分享圖
- [ ] 區域榜：`Accept-Language` 或 `CF-IPCountry` header → `runs.region` 欄位
- [ ] 防作弊 dashboard：標記異常 IP / player

**範圍估算**：15–25 個工程日。

**依賴**：
- OG image：node-canvas 或 satori（額外 dep）
- 防作弊：完整重構提交流程，client 與 server 計分邏輯需 1:1 對等
- 房間：WS 訊息加 `roomId` 路由

---

## 13. 開放問題 / 待決策

1. **每日榜重置時區**：目前默認 UTC 00:00，是否要支援使用者本地時區？影響跨時區排名公平性。**建議：固定 UTC，UI 顯示「距離下次重置 X 小時」。**

2. **暱稱衝突處理**：Phase 2 採「device-id 隱含主鍵 + 暱稱可重複（顯示時加 #1234 後綴）」或「暱稱強制唯一」？前者更友善（不會搶名）、後者更社群感。**待 UI Agent 提案。**

3. **斷線中玩家上傳分數**：客戶端在 WS 斷線、HTTP 仍通的情況下分數可上傳但廣播失效。是否需在 server 端對「最近 N 秒漏掉的 activity」做 replay？**建議：不做，斷線本來就會錯過。**

4. **行動裝置橫向 / 直向切換**：resize 觸發 `baseWidth()` 重算，但已堆方塊的 width 不會跟著縮。極端情況（手機翻轉）會出現方塊超出畫面。**建議：Phase 1 在 `resize` 中對既有方塊做比例縮放。**

5. **0 分上傳**：目前 0 分不上傳。如改為「上傳但不入榜」是否更一致？**建議維持現狀，避免動態 feed 被垃圾事件洗版。**

6. **音效預載**：當前 WebAudio 為動態合成，未來若改 sample-based 音效，需評估首次互動的 unlock 時機與大小（< 50KB）。

7. **多語系**：UI 文案目前硬編碼繁體中文。Phase 2 是否要支援 i18n？**待 UI Agent + 商業決策。**

8. **WS 訊息加版本欄位**：未來訊息 schema 演進時，是否要在每個訊息加 `v: 1`？**建議 Phase 1 起新增 `protocolVersion` 於 `init` 訊息，client 可警告版本不符。**

9. **score 上傳成功但 broadcast 失敗的補救**：目前 `insertScore` 後直接 `broadcast`，若 broadcast 拋錯不影響 POST 回應（已是 fire-and-forget）。是否需要記錄 broadcast 失敗？**建議：加 metric / counter，不影響回應。**

10. **健康檢查語意**：`/healthz` 目前永遠回 200，即便 DB 異常。是否要對 `countTotal.get()` 失敗回 503？**建議：加 try/catch，DB 不可用回 503。**

---

## 14. 變更紀錄

| 版本 | 日期 | 變更 |
| --- | --- | --- |
| 1.0.0 | 2026-05-28 | 初稿，對齊 Phase 0 程式碼現況，列出 Phase 1–3 規劃 |
