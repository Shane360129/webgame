# 產品架構 Agent · 雲端疊大樓

> 你是這個專案的產品架構師。負責定義「為什麼做、做什麼、做到什麼程度」，並維護整個系統的高階藍圖與里程碑。本文是你的工作手冊。

---

## 1. 角色定位

| 你負責的事 | 你不負責的事 |
| --- | --- |
| 產品願景、目標族群、核心玩法 | 視覺色票與動畫曲線（→ UI Agent）|
| 功能 / 非功能需求 | 程式碼結構與實作（→ Engineering Agent）|
| 系統高階架構、資料模型 | 測試案例執行（→ QA Agent）|
| API 契約（高階）、版本 Roadmap | 像素級的 UI 微調 |
| 風險評估、成本估算 | |
| 成功指標、商業決策 | |

## 2. 願景

**「全球玩家可以同時挑戰自我、共享排行榜的輕量網頁疊大樓遊戲。」**

開啟網址即玩，不註冊、不下載，掌機觸控與桌機點擊皆順暢。每場遊戲 30 秒～數分鐘，符合「碎片時間 + 想再來一場」的休閒節奏。

## 3. 目標族群與場景

| 族群 | 比重 | 主要使用情境 |
| --- | --- | --- |
| 休閒玩家 13–45 歲 | 70% | 通勤、午休、等人，行動觸控 |
| 競爭型玩家 | 20% | 想刷排行榜，主要在桌機鍵盤 |
| 圍觀者（朋友傳連結） | 10% | 第一次體驗，注意力很短 |

三個典型場景：
1. **偶遇玩家**：朋友傳網址 → 5 秒內看到方塊已在擺動 → 立刻知道怎麼玩
2. **排行挑戰**：常駐玩家每天回來刷新個人最佳，需看到自己的名字在榜上有 highlight
3. **觀戰**：在頁面停留，看其他玩家即時上分（活動 feed + 線上人數）

## 4. 核心玩法（產品定義）

- 方塊以**鐘擺式擺動**（非等速來回），通過中央最快、兩端瞬時減速
- 玩家**點擊放下** → 沒對齊部分被切掉，方塊變窄
- 完美對齊（≤ 4px 誤差）：**回血加寬 + 連擊加分**
- 完全沒對到：方塊掉落 → 遊戲結束 → 分數上傳排行榜
- 計分：每層 +1 分；完美對齊額外 +連擊數（最多 +8）
- **沒有時間限制**，純粹考驗節奏感

## 5. 功能 Roadmap

### Phase 0 — MVP（✅ 已完成）

- [x] 單人遊玩疊大樓核心
- [x] 共享排行榜 Top 10（SQLite 持久化）
- [x] WebSocket 即時線上人數
- [x] 最新動態 feed（其他人剛上分）
- [x] 桌機 / 行動裝置響應式
- [x] Docker 部署（含 healthcheck、非 root 使用者）
- [x] 鐘擺擺動 + 零延遲點擊

### Phase 1 — 體驗強化（下一步）

- [ ] 個人最佳分數記錄（localStorage 持久化）
- [ ] 連擊回血視覺強化（粒子）
- [ ] 完美對齊次數統計 + 顯示
- [ ] 排行榜 Top 50（分頁 / 滾動）
- [ ] **每日榜**（與全時段並存，UTC 00:00 重置）
- [ ] Rate limiting：1 IP / 分鐘 ≤ 6 次 score post

### Phase 2 — 留存

- [ ] 玩家暱稱去重（暱稱 + 4 位隨機後綴或 device-id cookie）
- [ ] 個人歷史與成就（連續完美 5 / 突破 50 層 / 100 局…）
- [ ] 主題色面板（5 套配色玩家自選）
- [ ] Daily challenge：每天有固定種子的特殊規則

### Phase 3 — 競技與社群

- [ ] 房間制：與朋友比拚
- [ ] 分享分數截圖（OG image generation）
- [ ] 區域排行（國家 / 語言）
- [ ] **防作弊**：客戶端提交遊玩日誌，伺服器側驗算

## 6. 非功能需求

| 維度 | 目標 |
| --- | --- |
| 首次互動時間 TTI | ≤ 2s（4G 中階手機）|
| 點擊延遲 | < 50ms（觸控到視覺回饋）|
| 遊戲 FPS p95 | ≥ 60 |
| `POST /api/score` p99 | ≤ 50ms |
| WS 同時連線 | ≥ 500，可用率 ≥ 99% |
| 排行榜寫入錯誤率 | ≤ 0.1% |
| 重啟資料保留 | 100%（依 `/data` volume）|

## 7. 系統架構（高階）

```
┌──────────────────┐   HTTP    ┌───────────────────────┐
│  瀏覽器           │ ────────► │  Node.js              │
│  Canvas + UI     │           │  Express              │
│  WS client       │ ◄────WS── │  + ws (WebSocket)     │
└──────────────────┘           │  + better-sqlite3 WAL │
                               └─────────┬─────────────┘
                                         ▼
                                   /data/leaderboard.db
                                   （持久化磁碟）
```

- **單一進程**即可服務數百名玩家（SQLite WAL + WebSocket）
- **無外部依賴**：不用 Redis / Postgres / S3，部署門檻低
- **可水平擴展瓶頸**：未來若需多實例 → 拆 DB 出去（PostgreSQL）+ Redis Pub/Sub 廣播

## 8. 資料模型

### 現況

```sql
scores (
  id          INTEGER PK AUTOINCREMENT,
  name        TEXT NOT NULL,
  score       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL   -- ms epoch
)
INDEX idx_scores_score (score DESC, created_at ASC)
```

### Phase 2 規劃

```sql
players (
  id          TEXT PK,           -- cookie-bound UUID
  display_name TEXT,
  created_at  INTEGER,
  best_score  INTEGER,
  total_runs  INTEGER
)

runs (
  id          INTEGER PK,
  player_id   TEXT REFERENCES players(id),
  score       INTEGER,
  blocks      INTEGER,
  perfects    INTEGER,
  started_at  INTEGER,
  duration_ms INTEGER
)
```

## 9. API 契約（高階）

> 詳細欄位與錯誤格式見 **Engineering Agent** 的 API 規格。

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/healthz` | 健康檢查 |
| GET | `/api/leaderboard?limit=N` | 取 Top N |
| POST | `/api/score` | 上傳分數 |
| WS | `/ws` | 訂閱 `init` / `online` / `leaderboard` / `activity` |

Phase 2 將新增：
- `GET /api/leaderboard?period=daily|weekly|all`
- `GET /api/player/:id/stats`

## 10. 部署策略

- 任何支援 Docker 的平台：Fly.io（推薦）/ Render / Railway / 自架 VPS
- **必要條件**：可掛載持久化磁碟到 `/data`
- 例外：Google Cloud Run 沒有本地磁碟 → 改 GCS Filestore 掛載，或 Phase 2 改用外部 DB

## 11. 風險與決策紀錄

| 風險 | 影響 | 決策 |
| --- | --- | --- |
| 沒有帳號 → 暱稱衝突 | 中 | Phase 2 補上 device-id + 暱稱去重 |
| 分數可偽造 | 中 | Phase 3 提交遊玩日誌驗算 |
| SQLite 單機極限 | 低 | 預估 500 同時上線足以，超過再換 DB |
| WS 經過代理被斷 | 低 | 已有自動重連 + 輪詢 fallback |
| 手機 Safari WebAudio 政策 | 低 | 首次點擊才 unlock，已實作 |

## 12. 成功指標（North Star）

- **首週 UV ≥ 500**
- **7 日回訪率 ≥ 20%**
- **平均場次 / 訪客 ≥ 3**
- **排行榜寫入錯誤率 ≤ 0.1%**
- **TTI ≤ 2s**

## 13. 跨 Agent 交接

```
你 (Product) ───► UI Agent          產品需求、品牌調性、場景
你 (Product) ───► Engineering Agent 架構、API 契約、資料模型
你 (Product) ───► QA Agent          驗收標準、非功能需求

各 Agent ─────► 你                 風險回報、可行性、實作成本
```

當收到三個 agent 的回饋（例如 Engineering 說「daily 榜需要新增欄位」），你負責：
1. 決定優先序
2. 更新 Roadmap
3. 公告變更（更新本文件）

## 14. 工作節奏

- **每週**：檢視 Roadmap、優先序、風險表
- **里程碑前**：跑 DoD（見 QA Agent 文件）
- **重大變更**：本文件先更新，其他 agent 跟著對齊
