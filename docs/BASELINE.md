# Phase 1 — 原始專案與基線

盤點日期：2026-10-29（Asia/Taipei）。根目錄：`CITY_AR_MV_CODEX/`。已閱讀 README、完整 `docs/SPEC.md`、`config/project.json` 與啟動文件。

## 原檔保護與盤點

- ZIP：`original_export/html-export-20261022T033950485Z.zip`，未修改。
- 原始 ZIP 與 `source_original` 全部檔案 hash 存在 `config/original-lock.json`；每次 baseline/compose/validate 檢查。
- 解壓至獨立 `tests/fixtures/original_export/`，63 個檔案設為檔案系統唯讀。原 ZIP 留在原處。
- 完整清單、大小與 hash：`docs/INVENTORY.md`；音訊細節：`reports/baseline-inventory.json`。
- `bundle.js` 9,513 bytes、`index.html` 866 bytes。這是編譯後發佈包，缺少原 Studio/ECS 編輯器工程。
- 只擷取應用程式 bundle 的場景 JSON 至 `reports/original-scene.json`，未修改 bundle，未反編譯閉源 XR 引擎。

## 辨識與場景

`city_painting` 為 PLANAR；top=0、left=71、width=581、height=775、isRotated=true、originalWidth=724、originalHeight=775。三份 target JSON（ZIP、source_original 根目錄及 image-targets 下）SHA-256 相同：`f3f9ce2903e598c0f2b30f3ce1ff51d3d2239160cb287257e4fd263da256675c`。

辨識圖、original/cropped/thumbnail 與 target JSON 原樣保留至輸出。Image Target 父節點及 anchor 配置不變；`NightCityOver'` 與 `Chracter` 原本為 1×1 平面、深度 0.02 / 0.04，繼續作為回歸測試基準。未以圖片長寬逕自改動 anchor 幾何；對齊仍需手機驗收。

| 原素材 | 實測 |
| --- | --- |
| night_city.png | 860×724 RGBA |
| character.png | 532×724 RGBA |
| city_ambient.mp3 | 32.000 秒、22,050 Hz、mono MP3 |
| Threads_.mp3 | 10.344 秒、48,000 Hz、stereo MP3 |

## 原事件與音效問題

原版宣告 `T01 AR Canvas Audio`、`T01 AR Canvas Fade`，使用 `REALITY_IMAGE_FOUND`、`REALITY_IMAGE_LOST` 與 `SCREEN_TOUCH_START`；事件按 targetName 過濾。

- 場景設定 `playAmbientOnFound=true`；掃描後播放可能遭行動瀏覽器手勢限制。
- `stopOnTargetLost=false`：離開目標後聲音仍可能繼續。
- voice 與 ambient 為獨立音軌，沒有共同 15 秒 master clock。
- `Threads_.mp3` 只有 10.344 秒，不能直接作完整 15 秒配樂。
- Fade 預設 target lost 後重設淡入；與保留進度需求不同。
- 原素材商業權利範圍未確認；目前僅作本機回歸測試，不標成原創 Trap 或 AI 生成。

## 驗證界限與進度

原版及新版 AR 入口在目前桌面瀏覽器均出現 `No valid session manager to handle this session`；原場景 desktop=disabled、phone=AR。未以此判定手機失敗，也未宣稱手機追蹤通過。

新版桌面預覽已實測載入、手勢播放、15 秒結束、暫停及模擬 lost/resume。Phase 1 盤點／環境／靜態事件分析完成；原版實機 baseline 未驗收。Phase 2 CLI、manual import、retry/cache/metadata、FFmpeg 組裝與驗證完成；生成服務仍為 NOT_CONFIGURED。播放器為可執行初版，不代表 Phase 3–5 驗收完成。

官方 API 已核對：[Image Target Events](https://8thwall.org/docs/api/studio/events/xr/image-targets)、[Position](https://8thwall.org/docs/api/studio/ecs/position)、[Scale](https://8thwall.org/docs/api/studio/ecs/scale)、[官方 target 載入範例](https://github.com/8thwall/8thwall/blob/main/apps/image-target-cli/README.md)。沿用 ECS 事件及原 export 的 `application.init(scene)` 方式，未升級或替換引擎。
