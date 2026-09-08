# 皇室對戰式 3D 重製原型

即時卡牌對戰的 3D 重製原型：伺服器權威模擬、手機直向操作、三種鏡頭版本、
以及一份會誠實回報缺口的資料查核系統。

> **非官方粉絲專案。** 與 Supercell 無關聯、未經認可、未取得授權。
> 本倉庫**不含任何官方模型、貼圖、動畫、音效或介面素材**；
> 場上與卡面上的每個角色都是程式化建出來的原創幾何。
> 詳見 [`docs/licensing-and-assets.md`](docs/licensing-and-assets.md)。

---

## 先講清楚：資料沒有齊

建置環境的網路政策阻擋了公開卡牌資料庫（`royaleapi.github.io`，CONNECT 回 403），
因此**沒有**取得固定版本的完整卡牌匯出檔。

結果是：

- 所有戰鬥數值都標記 `statsVerified: false`、`versionDate: null`
- 遊戲裡每張卡都會顯示「未驗」徽章
- 遊戲內建「資料」分頁與 `npm run audit:data` 會列出所有未驗證項目
- 本專案**不宣稱**是完整復刻，也不宣稱與任何平衡版本逐項一致

逐條的實作狀態（包含明確寫出「沒做到什麼」）在
[`docs/implementation-status.md`](docs/implementation-status.md)。
原始查核基準保留在 [`docs/clash-royale-3d-audit.md`](docs/clash-royale-3d-audit.md)。

---

## 快速開始

需要 **Node.js 20 以上**。

```bash
npm install     # 會自動把 three.js 複製到 public/vendor/
npm start       # http://localhost:3000
```

| 變數           | 預設值                | 說明                          |
| -------------- | --------------------- | ----------------------------- |
| `PORT`         | `3000`                | HTTP / WebSocket 監聽埠       |
| `DB_PATH`      | `./data/royale.db`    | SQLite 檔案路徑               |
| `BOT_AFTER_MS` | `12000`               | 配對多久後提供 AI 對手        |

## Docker

```bash
docker build -t royale-3d .
docker run -d --name royale -p 3000:3000 -v "$(pwd)/royale-data:/data" royale-3d
```

容器內 `/data` 是 volume，**請掛載持久化磁碟**，否則重啟後玩家檔案會清空。

---

## 玩法與功能

**對戰**

- 正規賽 3:00，前 2:00 單倍聖水、之後二倍
- 皇冠相同則進延長賽 2:00 三倍聖水，先摧塔者勝
- 延長賽結束仍未分勝負，比「最低塔血量百分比」，相同則平手
- 王塔開場不啟動：要等我方公主塔被摧毀，或王塔本身受到傷害
- 手牌 4 張 + 下一張的固定循環（打出的卡回到隊列尾端，不是重抽）
- 摧毀敵方公主塔後，該路可推進部署到敵方半場

**卡組**

- 8 個一般卡槽 + 2 個進化卡槽 + 1 個冠軍卡槽 + 1 個塔兵
- 進化需要先循環指定次數才會以進化型態出牌，每個進化有各自的能力
- 冠軍有獨立的主動技能、額外聖水成本與冷卻
- 塔兵替換公主塔（公主塔兵／飛刀公爵夫人／砲手／皇家主廚）

**法術**（六種投放型態，不是全部立即結算）

| 型態 | 例子 | 行為 |
|---|---|---|
| `projectile` | 火球、火箭、冰凍 | 有飛行時間，落點才結算 |
| `rolling` | 滾木、野蠻人木桶 | 沿路持續判定並擊退 |
| `aura` | 毒藥、地震、狂暴、龍捲風 | 範圍內持續作用 |
| `waves` | 箭雨、墓園 | 分波傷害／分波生成 |
| `targeted` | 閃電 | 鎖定範圍內生命最高的目標 |
| `spawn` | 哥布林飛桶、皇家空投 | 落地後生成單位 |

所有法術對塔都有傷害折減；地震對建築另有倍率。

**多人**

- 伺服器 20 Hz 權威模擬，廣播 10 Hz 快照，客戶端只送輸入
- 依獎盃接近度配對，等待越久容忍度越大
- 等超過 12 秒才提供 AI 對手，並在畫面上標示「電腦對手（AI）」
- 斷線有 30 秒寬限，重連會自動接回進行中的對戰；逾時判負

**三種鏡頭版本**（同一份資料與規則，只換取景）

- 原作式固定視角：把整個場地投影後自動框進畫面，直向橫向都完整可見
- 可旋轉視角：拖曳環繞、滾輪縮放
- 近距離觀戰：貼近地面追焦戰鬥重心

**寶箱**

八種箱，每箱都帶查核文件要求的九個欄位
（`chest_id`、`version_date`、`arena_range`、`eligible_card_rule`、`reward_pool`、
`guarantees`、`probability_table`、`choice_count`、`source_url`）。
開箱是「抽稀有度分支 → 保底覆寫 → 從競技場已解鎖且非新卡排除期的卡池抽卡」，
不是一個通用的均勻亂數。機率表的自檢**只回報偏差，不會自動改成看起來合理的數字**。

---

## 專案結構

```
server.js                  HTTP + WebSocket；REST 目錄／寶箱／查核端點
src/shared/                伺服器與瀏覽器共用（同一份檔案，不是兩套實作）
  rules.js                 時間、聖水、場地、王塔啟動等規則常數
  cards.js                 部隊與建築
  cards-spells.js          法術、冠軍、塔兵
  catalogue.js             合併目錄 + 涵蓋報表
  chests.js                寶箱定義 + 機率表驗證器
  chest-open.js            開箱器（分支、保底、卡池過濾）
  deploy.js                部署合法性（純函式，前後端共用）
  sim.js                   對戰模擬器（20 Hz、決定性）
  ai.js                    AI 對手
src/server/
  db.js                    玩家檔案、收藏、獎盃榜
  match.js                 對戰房間與配對
public/
  js/render/               kit / weapons / models / animate / scene / portraits
  js/ui/                   battle / menus / cards
  js/                      main / state / net / local
  vendor/                  three.js（MIT，由 npm 複製）
tests/                     56 個檢核案例
docs/                      查核文件、實作狀態、授權說明
```

**共用模擬器**是這個專案的核心設計：`src/shared/` 由伺服器直接 `import`，
同時也以 `/shared/*` 靜態路徑提供給瀏覽器。所以 AI 練習模式跑的是**同一份程式碼**，
不是另一套簡化規則；同 seed 與同輸入會產生逐欄位相同的快照。

---

## 檢核

```bash
npm test              # 56 個案例
npm run audit:data    # 資料查核報表（涵蓋、未驗證清單、寶箱自檢）
```

`tests/rules.test.js`（35 個）涵蓋卡牌輪替、時間、聖水、索敵、傷害、控制、
摧塔、勝負與模擬決定性。
`tests/data.test.js`（21 個）驗證每張卡都帶 provenance、
未驗證欄位確實標記為未驗證、以及寶箱的結構、保底、卡池過濾與分布差異。

---

## 已知限制

- **戰鬥數值全部未驗證。** 需要固定版本的完整匯出檔才能通過「數值可信」門檻。
- **角色造型沒有比對基準。** 是依公開印象重新設計的原創幾何，不是逐項還原。
  需要使用者提供要對齊的版本截圖。
- **真人對真人只在本機驗證過。** 兩個真實客戶端測過配對、同步、出牌歸屬、
  斷線與重連（見 `docs/implementation-status.md` 的實測紀錄），
  但沒有在真實網路延遲與封包遺失下測過。
- **沒有路徑尋找。** 走位是「朝目標／朝橋頭」的直線加碰撞推擠。
- **沒有音效。**

## 授權

專案程式碼 MIT。three.js 為 MIT。
專案不含任何第三方美術素材 —— 見 [`docs/licensing-and-assets.md`](docs/licensing-and-assets.md)。
