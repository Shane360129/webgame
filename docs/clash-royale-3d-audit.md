# 《皇室戰爭》3D 重製：資料查核與驗收規格

> 這份文件是使用者提供的查核基準，原樣保留在專案裡當作驗收依據。
> 本次實作對每一條的處理方式，見 [`implementation-status.md`](./implementation-status.md)。

查核日期：2026-09-07
狀態：研究階段；尚未修改或重新發布先前遊戲。
完整性結論：**公開資料已找到多個可靠入口，但尚未取得最新版全卡牌、全模式規則、完整角色模型與動畫的可用集合，因此不能宣稱「全部資料已齊」。**

## 1. 需求與版本基準

- C：使用者不接受前一版的原創替代角色，要求依《皇室戰爭》的既有角色、場景、介面製作 3D 遊戲。
- O：先完成資料查核，再製作可試玩的多版本遊戲；角色相似度與規則一致性均屬驗收範圍。
- S／T：來源可追溯、明確標註缺口，不用虛構卡牌與自訂數值冒充原作。
- A／R：供工程實作與使用者試玩；交付來源、涵蓋狀態、重製規格與檢核點。
- 研究假設：以查核日可找到的國際版官方公告為資料邊界。使用者手機實際版本、地區版本、競技場及塔皮膚尚未確認，不能混用成同一套視覺基準。

## 2. 已確認的資料來源

| 內容 | 來源 | 能支持的範圍 | 不能據此宣稱 |
|---|---|---|---|
| 遊戲整體定位 | [Supercell 遊戲官網](https://supercell.com/en/games/clashroyale/) | 即時卡牌對戰、角色與推塔目標 | 完整戰鬥引擎規格 |
| 最新賽季內容 | [2026-09-07 官方公告](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-minion-academy/) | 新卡、新英雄、活動及模式的當期資訊 | 歷年全部模式均已整理 |
| 卡組系統變動 | [2026 三月更新](https://supercell.com/en/games/clashroyale/blog/release-notes/march-update-2026/) | 特殊卡槽、友誼對戰與部分玩法變更 | 公告中的歷史設定永遠有效 |
| 官方說明分類 | [Supercell Support](https://support.supercell.com/clash-royale/en/game/index.html) | 卡組、Champions、Heroes、進化、塔兵等入口 | 每頁內容均可直接批次取得 |
| 卡牌資料 | [RoyaleAPI 靜態資料庫](https://github.com/RoyaleAPI/cr-api-data) | 可下載的結構化卡牌與相關歷史資料 | 最新國際版完整名單 |
| 即時卡牌頁 | [RoyaleAPI Cards](https://royaleapi.com/cards/popular) | 普通卡、進化、英雄等可見條目 | 熱門排行筆數等於基礎卡牌總數 |
| 聖水與時間 | [官方聖水說明](https://support.supercell.com/clash-royale/en/articles/elixir.html)、[官方時間規則更新](https://supercell.com/en/games/clashroyale/blog/release-notes/november-update/) | 不同階段倍率與延長賽 | 所有活動均沿用標準規則 |
| 寶箱與機率 | [官方掉落資訊](https://supercell.com/en/games/clashroyale/blog/news/clash-royale-chest-info-2/) | 各類獎勵系統及表格 | 一個通用隨機函式可代表全部卡包 |
| 美術展示 | [Ocellus：Clash Royale](https://ocellus-studio.com/project/15179/clash-royale) | 參與製作方的角色、競技場、塔造型與插畫 | 可下載、可改作遊戲的全套模型 |
| 3D 製作方法 | [Adobe：Supercell 美術團隊訪談](https://www.adobe.com/products/substance3d/magazine/supercell-helsinki-creating-stylized-content-for-clash-of-clans-and-clash-royale.html) | 模型、材質、貼圖與迭代流程參考 | 遊戲執行時的完整渲染實作 |
| 官方素材入口 | [Supercell Fan Kit](https://fankit.supercell.com/clashroyale) | 官方素材入口已確認 | 已取得全部下載內容或新遊戲使用授權 |

## 3. 實際下載資料的查核結果

以下是本次對下載檔案的程式計數，**是資料集筆數，不是目前遊戲的完整內容數量**。

| 檔案 | 實際查核結果 | 風險 |
|---|---|---|
| cards.json | 120 筆、120 個不同 ID；Troop 87、Building 14、Spell 19 | 包含 Super／Party 等特殊條目，不能全當一般可收藏卡 |
| cards_i18n.json | 120 筆；具有繁體中文名稱欄位 `cnt` | 翻譯跟隨該快照，不保證符合使用者版本 |
| cards_stats.json | 6 個集合：troop 93、building 89、spell 71、projectile 92、characters 125、character_buff 62 | 包含內部構成資料，不能將集合筆數相加當卡牌總數 |
| arenas.json | 79 筆 | 含訓練及不同用途的場景設定，不等於目前獎盃之路競技場數 |

原始來源：[資料索引](https://royaleapi.github.io/cr-api-data/)、[卡牌清單](https://royaleapi.github.io/cr-api-data/json/cards.json)。

關鍵發現：

1. `cards.json` 具有名稱、ID、聖水、類型、稀有度等欄位，但本身不是逐等級戰鬥數值表。
2. 120 筆條目的 `is_evolved` 全為 false；部分具有進化關聯欄位，不能據此說沒有進化卡，也不能說進化資料已齊。
3. 該清單缺少 `goblinstein`、`rune-giant`、`berserker`、`boss-bandit`、`minion-giant` 等 key。至少 Minion Giant 已由查核日官方公告確認，因此這個檔案不能作為最新版全集。
4. 當前 RoyaleAPI 卡牌頁可經網頁搜尋讀取；本次直接下載 HTML 回傳 HTTP 403。沒有繞過存取限制，也未取得可重現的當前完整批次匯出。
5. 已取得數值與場景快照，不表示已驗證與 2026-09-07 平衡版本一致。

## 4. 目前版本不能忽略的內容

官方九月公告確認 Minion Giant 與 Hero Ice Wizard，並包含競技 2v2、Princess Gambit 與 Royale Shuffle。部分項目在九月稍後才開始，必須區分「已公布」和「已開放」。[來源](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-minion-academy/)

三月更新記錄了 Evo／Hero／Wild 卡槽配置，顯示只做八個普通卡槽已不足以代表當期系統；應與較新的更新再次核對。[來源](https://supercell.com/en/games/clashroyale/blog/release-notes/march-update-2026/)

進化要處理卡槽、出牌循環及進化後能力，不是單純把血量提高；塔兵也應獨立於普通部署卡處理。[進化說明](https://support.clashroyale.com/hc/en-us/articles/49484923993883-Card-Evolution)、[塔兵更新](https://supercell.com/en/games/clashroyale/blog/release-notes/game-update-december-13)

## 5. 前一版需要重做的項目

此表的「前一版」依已交付原型程式與畫面結構盤點，不是官方產品的描述。

| 項目 | 前一版問題 | 重製驗收要求 |
|---|---|---|
| 角色 | 原創卡名、Emoji 卡圖、多數共用簡化人形 | 每張卡映射正確角色；輪廓、服裝、武器、配色及動作有參考依據 |
| 卡牌資料 | 32 張自訂卡，自訂生命與傷害 | 使用有版本日期、等級及來源的數值，未驗證欄位不以猜測補齊 |
| 介面 | 桌面深色側欄式排版 | 依指定手機畫面重建資訊層級、卡框、聖水列與對戰 HUD |
| 勝負 | 三分鐘結束後比較總塔血 | 依標準對戰規則處理延長賽與 Tiebreaker；特殊模式另列 |
| 王塔 | 一開始即可自動攻擊 | 補齊並驗證王塔啟動條件 |
| 法術 | 多數立即造成單次範圍效果 | 分別處理延遲、彈道、波次、持續傷害、控制及對塔傷害 |
| 單位移動 | 簡化過橋與距離索敵 | 測試碰撞、推擠、換目標、建築吸引、空地與跳躍等差異 |
| 寶箱 | 三個自訂寶箱與簡化保底 | 依箱種、競技場、已解鎖內容及版本限定條件建立掉落表 |
| 多人 | 僅本機 AI | 真人模式需獨立伺服器、同步、配對、斷線處理與測試 |
| 多版本 | 只切換介面與視角 | 必須說明比較的是鏡頭／操作／美術，不把切色當內容版本 |

標準賽制應以官方時間規則與聖水說明為基礎；細部同時摧塔、等血量與特殊事件仍需對照指定版本的實際重播。[時間規則](https://supercell.com/en/games/clashroyale/blog/release-notes/november-update/)、[聖水](https://support.supercell.com/clash-royale/en/articles/elixir.html)

## 6. 寶箱資料如何建模

「所有卡包」需拆成箱種、獎勵種類、解鎖條件、稀有度、數量、重抽／選擇流程與機率版本。官方資訊頁列有 Choice Chests、Lucky Chests、Evolution & Hero Boxes 等類別，不能沿用上一版的三種自訂寶箱。[來源](https://supercell.com/en/games/clashroyale/blog/news/clash-royale-chest-info-2/)

建議資料欄位：`chest_id`、`version_date`、`arena_range`、`eligible_card_rule`、`reward_pool`、`guarantees`、`probability_table`、`choice_count`、`source_url`。

檢核：分支機率加總、保底條件、數量單位、已解鎖卡池與新卡排除期。官方頁面若有表格口徑不明或總數不一致，保留原始值並標記待查，不自行修正成看似合理的數字。

## 7. 依原作樣式製作 3D 的正確工作順序

以下是製作建議，不表示已完成模型。

1. 固定參考版本：國際版／其他地區版本、更新日期、競技場與塔皮膚。
2. 建立每角色的參考板：正面、側面、背面、實際戰場比例、移動及攻擊畫面。
3. 先完成八張代表卡及雙方塔的模型驗收：先確認角色辨識度，再擴充整體內容；這只是驗收批次，不是把完整需求縮成八張卡。
4. 分開驗收模型、材質、骨架、動作與遊戲邏輯。只貼原卡圖不算完成 3D 角色。
5. 將鏡頭與遊戲規則解耦：相同角色和對戰資料，提供原作式固定視角、可旋轉視角、近距離觀戰三種測試方式。
6. 最後整合手機操作、部署預覽、可取消拖曳、法術範圍、聖水不足回饋與效能設定。

模型與材質流程參考：[Supercell 美術訪談](https://www.adobe.com/products/substance3d/magazine/supercell-helsinki-creating-stylized-content-for-clash-of-clans-and-clash-royale.html)。具體角色與場景作品參考：[Ocellus](https://ocellus-studio.com/project/15179/clash-royale)。展示作品不能代替可匯入遊戲的模型與動畫。

## 8. 資料驗收門檻

| 門檻 | 通過條件 |
|---|---|
| 名單完整 | 固定版本；基礎卡、進化、Hero、Champion、塔兵、活動變體分開計數，與當期清單逐項核對 |
| 數值可信 | 每張卡能追溯版本、等級、來源；不混用舊資料、不同等級及召喚物數值 |
| 視覺可信 | 每角色有實際參考；三視角可辨識；卡圖與模型一致；無 Emoji 或共用人形冒充 |
| 動作完整 | 出生、待機、移動、攻擊、受擊、死亡與特殊技能有定義與驗證 |
| 規則完整 | 卡牌輪替、時間、聖水、索敵、傷害、控制、摧塔與勝負有獨立檢核案例 |
| 卡包可信 | 依箱種與版本核對機率、保底、可掉落內容與數量；不能把均勻隨機當官方分布 |
| 多人可用 | 真正兩個客戶端測試同步、延遲、重連；AI 對戰不能標示為線上玩家 |
| 多版本可比較 | 使用同一組測試卡與規則，記錄畫面、操作及效能差異 |

## 9. 素材與授權的實際限制

官方 Fan Content Policy 將其素材的使用限定在允許的粉絲內容用途，並明確排除使用相關素材製作新遊戲，包含免費遊戲。故找到 Fan Kit 並不等於取得重製遊戲的授權；加上「非官方」標示也不會擴大授權範圍。[官方政策](https://supercell.com/en/fan-content-policy/)

本次沒有取得可供本專案使用的完整官方角色模型、貼圖、骨架、動畫及音效。依公開畫面重新建模是另外的製作工作，也不能自動推定已獲得角色或素材使用授權。本文件不是針對特定司法管轄區的法律結論。

## 10. 下一步所需的具體輸入

- 你想對齊版本的主畫面、卡牌收藏頁與一張對戰截圖，用來鎖定 UI、角色版本與競技場。
- 若有可提供本專案使用的模型或美術檔，附上來源與使用範圍；不需要提供遊戲帳密。
- 若要求全卡牌數值一致，需取得固定版本的完整卡牌資料匯出或逐卡可核對的資料來源；本次下載的歷史快照不符合這個門檻。

依「資料齊全後再開始製作」的要求，目前先完成此查核文件，不把有缺口的研究包裝成完整復刻，也不繼續擴充不符合要求的原創角色原型。
