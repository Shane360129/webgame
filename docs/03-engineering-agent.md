# 程式設計 Agent · 雲端疊大樓

> 你是工程師。負責把產品需求與設計規格變成可運行、可部署、可維護的程式碼。前後端、API、資料、部署管線、效能、安全都由你實作。本文是你的工作手冊。

---

## 1. 角色定位

| 你負責的事 | 你不負責的事 |
| --- | --- |
| 程式碼結構與模組劃分 | 產品定義（→ Product）|
| 演算法、資料結構、狀態機 | 視覺色票、動畫秒數規格（→ UI）|
| 資料庫 schema 與 query | 測試案例執行（→ QA）|
| REST + WebSocket 實作 | |
| 建置與部署管線（Dockerfile、CI）| |
| 效能調校、安全 | |
| 監控、日誌、錯誤處理 | |
| 程式碼規範維護 | |

## 2. 技術棧

| 層 | 選擇 | 為什麼 |
| --- | --- | --- |
| Runtime | Node.js ≥ 20 | 廣泛部署支援，原生 fetch、AbortSignal |
| HTTP | Express 4 | 最小心智成本，靜態 + REST 一把抓 |
| WS | `ws` 8 | 業界標準、輕量 |
| DB | `better-sqlite3` 11 | 同步 API、WAL、零外部服務、prebuilds 完備 |
| 前端 | 原生 HTML / CSS / Canvas / JS | 無建置鏈、deploy 即用 |
| Container | `node:22-slim`（multi-stage） | 小、glibc 相容 prebuilds |

## 3. 檔案結構

### 現況

```
/
├── server.js                    # Express + WS + DB（單檔）
├── public/
│   ├── index.html
│   ├── style.css
│   └── game.js                  # Canvas + WS client + UI（單檔）
├── data/                        # 執行時自動建立（.gitignore）
│   └── leaderboard.db
├── Dockerfile                   # multi-stage
├── .dockerignore
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── docs/                        # ← 4 agent 文件
```

### Phase 1 規劃結構

```
public/
├── index.html
├── style.css
└── js/
    ├── main.js                  # 啟動 + 接線
    ├── tokens.js                # 從 UI agent 同步的常數
    ├── game/
    │   ├── state.js             # 純狀態機
    │   ├── physics.js           # 鐘擺 / 碰撞 / 重力
    │   ├── renderer.js          # canvas 繪製
    │   └── audio.js             # WebAudio
    ├── ui/
    │   ├── hud.js
    │   ├── leaderboard.js
    │   ├── overlays.js
    │   └── activity.js
    └── net/
        ├── ws-client.js
        └── api.js

src/                              # 後端拆檔
├── server.js                    # 啟動
├── app.js                       # express app
├── db.js                        # better-sqlite3 wrapper
├── ws.js                        # WebSocket 管理
├── routes/
│   ├── health.js
│   ├── leaderboard.js
│   └── score.js
├── middleware/
│   └── rate-limit.js
└── lib/
    ├── sanitize.js
    └── log.js
```

## 4. 核心演算法

### 4.1 鐘擺位置（必須與 UI Agent 規格一致）

```js
// 在 spawnActive() 設定 t0、ω、side
// 每幀（與點擊瞬間）以時間計算位置：
function activeXAt(a, nowMs) {
  const t   = (nowMs - a.t0) / 1000;
  const span = Math.max(0, (W - a.width) / 2);
  let x = span * (1 + a.side * Math.cos(a.omega * t));
  return Math.max(0, Math.min(W - a.width, x));
}
```

**關鍵**：點擊瞬間 `drop()` 第一行就是 `cur.x = activeXAt(cur, performance.now())`，達到**次幀精準** → 零點擊延遲。

### 4.2 落下判定

```js
const left    = Math.max(cur.x, prev.x);
const right   = Math.min(cur.x + cur.width, prev.x + prev.width);
const overlap = right - left;

if (overlap <= 0) {
  // 完全沒對到 → 全顆 debris，遊戲結束
}

const delta   = cur.x - prev.x;
const perfect = Math.abs(delta) <= PERFECT_TOL;   // PERFECT_TOL = 4

if (perfect) {
  combo += 1;
  placedWidth = Math.min(baseWidth(), prev.width + REGROW);   // REGROW = 6
  placedX     = prev.x - (placedWidth - prev.width) / 2;
} else {
  combo = 0;
  placedX     = left;
  placedWidth = overlap;
  // 切掉的部分 spawnFalling(...)
}

score += 1 + (perfect ? Math.min(combo, 8) : 0);
```

### 4.3 相機平滑

```js
const desired = Math.max(0, targetActiveY - (floorY - activeLevel * BLOCK_H));
state.cameraOffset += (desired - state.cameraOffset) * Math.min(1, dt * 8);
```

## 5. API 契約（權威定義）

### `GET /healthz`
```json
{ "ok": true, "online": 0, "total": 0 }
```

### `GET /api/leaderboard?limit=10`
- `limit`：1–50，預設 10
```json
{
  "entries": [
    { "rank": 1, "name": "Alice", "score": 200, "createdAt": 1779934533597 }
  ],
  "online": 3
}
```

### `POST /api/score`
- Body：`{ name: string, score: integer }`
- `name`：0–16 字，會被 sanitize（剝除 0x00–0x1F、0x7F、`<`、`>`，合併空白），空字串落回 `匿名玩家`
- `score`：integer，0 ≤ score ≤ 1_000_000，超出範圍回 400
```json
{ "ok": true, "rank": 3, "score": 42, "name": "Alice", "entries": [...] }
```
錯誤：`400 { "ok": false, "error": "invalid score" }`

### `WS /ws`
- 連線時伺服器主動推 `init`
- Client → Server：`{ "type": "ping" }` → 回 `{ "type": "pong" }`
- Server → Client：
  - `{ "type": "init",       "online": N, "entries": [...] }`
  - `{ "type": "online",     "online": N }`
  - `{ "type": "leaderboard","entries": [...] }`
  - `{ "type": "activity",   "name": ..., "score": ..., "rank": ... }`

伺服器每 30s ping，2 次未回應即 terminate。

## 6. 資料層

### Schema

```sql
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_score
  ON scores (score DESC, created_at ASC);
```

### 操作慣例

- **永遠用 prepared statements**（防 SQL 注入）
- `journal_mode = WAL`（多讀單寫）
- 寫入是同步的（better-sqlite3）→ 不阻塞但要避免長 transaction

## 7. 程式碼規範

### JS

- 檔首 `'use strict'`
- 變數：`const` > `let`，不用 `var`
- 純函數優先；副作用集中在 `state` 物件
- 命名：`camelCase` 函數變數、`UPPER_SNAKE` 常數
- **註解只寫 WHY，不寫 WHAT**；命名好的程式碼不需要解釋自己
- 不寫 backwards-compat shim；刪除就是刪除
- 不寫沒被叫到的程式碼

### Regex 安全
不允許在原始碼中直接嵌入 `\x00`–`\x1F` 控制字元；必須用 `\xHH` 跳脫（否則 `git` 會把檔案視為 binary）：

```js
// ✅ 正確
const BAD_CHARS = /[\x00-\x1F\x7F<>]/g;

// ❌ 錯誤（檔案會變 binary）
const BAD_CHARS = /[ ... 包含實際 control byte ... ]/g;
```

### CSS

- 用 CSS variables（design tokens）
- 不寫硬編色碼
- 響應式優先用 `clamp()` 與斷點 media query

## 8. 效能

### 前端

- DPR 偵測，setTransform 縮放繪製
- 樓層離畫面外 skip（已做）
- 星空只在 W/H 改變時重新生成（已做）
- `requestAnimationFrame` + `performance.now()`
- 避免每幀建立 garbage（大物件、map/filter 鏈）

### 後端

- prepared statements 一次編譯
- broadcast 時 `JSON.stringify` 一次重複送
- 心跳 30s，dead conn 立即 terminate
- JSON body limit 8kb

### 目標

| 指標 | 目標 |
| --- | --- |
| FPS p95 | ≥ 60 |
| `POST /api/score` p99 | ≤ 50ms |
| WS init 送達 | ≤ 200ms |
| 500 WS + 1 broadcast/s 記憶體 | ≤ 100MB |

## 9. 安全

### 已實作

- [x] 名字 sanitize（剝除控制字元、`<`、`>`）
- [x] 排行榜 render 用 `textContent`（防 XSS）
- [x] SQL：全 prepared statements
- [x] JSON body limit 8kb
- [x] 分數範圍檢查
- [x] WebSocket dead-conn 偵測

### Phase 1 需補

- [ ] **Rate limiting**：每 IP / 分鐘 ≤ 6 次 `POST /api/score`
- [ ] **Helmet** 與 CSP header
- [ ] WS 訊息頻率限制（client 不可洪水）
- [ ] 結構化 logging（含 requestId）

### Phase 3

- [ ] 分數驗算：客戶端提交 run log（每次落下時間+位置），伺服器重跑判定

## 10. 部署

### Docker

- **Multi-stage**：builder 帶 build tools → runtime 只放 `node:22-slim`
- 跑在 **`node` 使用者**（非 root）
- `HEALTHCHECK` 用 `/healthz`
- `VOLUME ["/data"]`：必須掛持久化磁碟

### 環境變數

| 變數 | 預設 |
| --- | --- |
| `PORT` | `3000` |
| `DB_PATH` | `/data/leaderboard.db` |
| `NODE_ENV` | `production` |

### Reverse proxy

- 必須允許 WebSocket Upgrade（Nginx：`proxy_set_header Upgrade $http_upgrade; Connection "upgrade";`）
- TLS 上層處理

## 11. Re-plan / 工程路線圖

### 立即（Phase 1）

- [ ] 拆分 `game.js`（→ §3 模組結構）
- [ ] 拆分 `server.js`
- [ ] `lib/sanitize.js` 抽出 + 寫單元測試
- [ ] `middleware/rate-limit.js`（token bucket，純記憶體）
- [ ] `lib/log.js`：結構化 JSON log
- [ ] Helmet + CSP
- [ ] 測試 harness：`node --test` for unit、`playwright` for e2e

### Phase 2

- [ ] 引入 `player_id` cookie（HttpOnly、Secure、SameSite=Lax）
- [ ] `players` + `runs` 表 + migration
- [ ] 每日榜：`scores` 加上 `(created_at, score)` 複合索引
- [ ] 前端可選擇用 esbuild 打包（如果模組增多）

### Phase 3

- [ ] 提交 run log + 伺服器驗算
- [ ] 切到 PostgreSQL（若要多實例）
- [ ] Redis Pub/Sub 處理跨實例廣播

## 12. 監控與日誌

### 現況

- `console.log` 啟動訊息
- 錯誤吞掉（生產不應這樣）

### Phase 1 目標

- 結構化 log JSON（pino 或自製 wrapper）：`{ ts, level, msg, requestId, ip, ... }`
- 增加 `/metrics` endpoint（Prometheus 格式）：online、total scores、p50/p99 latency
- 收 unhandled rejection / uncaught exception → log + exit

## 13. 跨 Agent 交接

```
Product ──► 你   架構決策、API 契約、Roadmap
UI      ──► 你   tokens、動畫曲線、字串、聲音規格
QA      ──► 你   bug 報告、效能 issue、安全發現

你 ──► QA       build/run 指令、test hooks、API doc
你 ──► UI       技術可行性、效能限制
你 ──► Product  風險、實作成本、技術債
```

## 14. 提交前自我檢查

- [ ] `node --check` 所有 JS 通過
- [ ] `npm start` 本機可起服
- [ ] `curl /healthz` 回 200
- [ ] `git status` 沒有意外檔（無 node_modules、data/）
- [ ] 新增的 sanitize / validation 寫了測試
- [ ] commit message 說明 WHY 不是 WHAT
- [ ] 沒留 `console.log` 偵錯
- [ ] 沒嵌入控制字元到原始碼

## 15. 常用指令

```bash
# 開發
npm install
npm start

# 測試（Phase 1 後）
node --test
npx playwright test

# 容器
docker build -t cloud-tower .
docker run -d -p 3000:3000 -v "$(pwd)/tower-data:/data" cloud-tower

# 健康檢查
curl http://localhost:3000/healthz
```
