# 雲端疊大樓 ☁️🏙️

一個可部署到雲端的網頁遊戲：**疊大樓**！
比比看誰能把樓蓋得最高，分數會即時同步到**共享排行榜**，所有玩家可以同時在同一個網站各自遊玩、比拚名次，並看到目前線上人數與最新動態。

> 經典 Stack 玩法：方塊左右移動 → 點擊放下 → 沒對齊的部分被切掉 → 越疊越窄 → 完美對齊可加分回血。

## ✨ 功能特色

- 🎮 **疊大樓遊戲**：HTML5 Canvas + 物理感掉落動畫
- 🏆 **共享排行榜**：所有玩家共用一個 Top 10（SQLite 持久化儲存）
- 👥 **多人同時遊玩**：每位玩家獨立遊玩自己的場次，分數即時上傳
- 🔴 **即時線上人數**：WebSocket 串流
- 📣 **最新動態**：他人完成一場就會即時推播
- 💯 **完美連擊 + 回血**：對齊獎勵讓高手能撐更久
- 📱 **手機 / 桌機自適應**：觸控、滑鼠、鍵盤皆可
- 🔊 **內建音效**（可關閉）
- 🐳 **單一 Docker 映像即可部署**

## 🚀 快速開始（本機）

需要 **Node.js 20 以上**。

```bash
npm install
npm start
# 開啟 http://localhost:3000
```

排行榜資料庫預設寫入 `./data/leaderboard.db`，可用環境變數調整：

| 變數      | 預設值                  | 說明                     |
| --------- | ----------------------- | ------------------------ |
| `PORT`    | `3000`                  | HTTP / WebSocket 監聽埠 |
| `DB_PATH` | `./data/leaderboard.db` | SQLite 檔案路徑          |

## 🐳 使用 Docker

```bash
# 建置
docker build -t cloud-tower .

# 執行（將 leaderboard 資料庫存到本機 ./tower-data 目錄）
docker run -d --name tower \
  -p 3000:3000 \
  -v "$(pwd)/tower-data:/data" \
  cloud-tower
```

容器內部已將 `/data` 設為 volume，**請務必掛載一個持久化磁碟**，否則重啟後排行榜會清空。

## ☁️ 部署到雲端

這個映像可以丟到任何支援 Docker 或 Node 的平台。下面是幾個常見選擇：

### Fly.io
```bash
fly launch --no-deploy           # 產生 fly.toml，選擇 Dockerfile
fly volumes create tower_data --size 1 --region <region>
# 編輯 fly.toml 加上：
# [mounts]
#   source = "tower_data"
#   destination = "/data"
fly deploy
```

### Render
1. New → **Web Service** → 連結這個 repo
2. Runtime 選 **Docker**（會自動讀取 `Dockerfile`）
3. 在 **Disks** 區塊新增一顆磁碟，Mount Path 設為 `/data`，1 GB 即可
4. Environment：留空，預設值就能跑（要改埠就設 `PORT`）
5. Deploy

### Railway
1. New Project → Deploy from Repo
2. Railway 會偵測到 `Dockerfile`
3. 在 **Volumes** 中加一顆 mount 到 `/data`
4. 預設 `PORT` Railway 會注入，已支援
5. Deploy

### Google Cloud Run
Cloud Run 沒有持久化磁碟，請改用 Cloud Storage / Cloud SQL，或使用 Cloud Run 的 **2nd gen execution environment + Filestore mount**。最簡單的做法：
```bash
gcloud run deploy cloud-tower \
  --source . --region <region> --allow-unauthenticated \
  --port 3000 \
  --add-volume name=data,type=cloud-storage,bucket=<your-bucket> \
  --add-volume-mount volume=data,mount-path=/data
```

### 自架 / VPS
```bash
docker run -d --restart unless-stopped --name tower \
  -p 80:3000 -v /srv/tower-data:/data cloud-tower
```
建議在前面再擺一層 Nginx / Caddy 處理 TLS 與 WebSocket 升級（`/ws`）。

## 🧩 架構

```
┌──────────────────────┐    HTTP / WebSocket    ┌──────────────────────────┐
│  瀏覽器              │ ─────────────────────► │  Node.js (Express + ws)  │
│  - Canvas 遊戲       │                        │  - 靜態檔                │
│  - 排行榜 UI         │ ◄───── broadcast ───── │  - REST /api/score       │
│  - WebSocket client  │                        │  - WebSocket /ws         │
└──────────────────────┘                        │  - better-sqlite3        │
                                                └────────────┬─────────────┘
                                                             ▼
                                                    /data/leaderboard.db
```

- 前端：原生 HTML/CSS/JS，無打包步驟
- 後端：Express 提供靜態檔與 REST，`ws` 處理 WebSocket
- DB：SQLite（透過 `better-sqlite3`，同步、快、零外部服務）
- 即時：分數送出 → 廣播給所有 WS client → 立即更新 Top 10 與動態列

## 🔌 API

| Method | Path                | 說明                              |
| ------ | ------------------- | --------------------------------- |
| GET    | `/healthz`          | 健康檢查                          |
| GET    | `/api/leaderboard?limit=10` | 取得 Top N 分數              |
| POST   | `/api/score`        | 提交分數 `{ name, score }`        |
| WS     | `/ws`               | 訂閱線上人數、排行榜更新、動態     |

WebSocket 訊息類型：
- `{ type: "init", online, entries }` — 連線時的初始狀態
- `{ type: "online", online }` — 線上人數變動
- `{ type: "leaderboard", entries }` — Top 10 更新
- `{ type: "activity", name, score, rank }` — 有人剛上傳分數

## 📜 License

MIT
