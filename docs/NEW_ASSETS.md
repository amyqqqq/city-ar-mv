# 新人物與霓虹城市整合

沿用現有 pipeline、web/runtime 與 8th Wall 場景，未重建專案。日期：2026-10-29。

## 素材路徑

`new_assets` → manual provider → `generated/characters`、`generated/backgrounds` 的內容雜湊素材與 metadata → `generated/selections` → compose → `dist/assets/characters.png`、`dist/assets/backgrounds.png` → manifest → `loadAssets()` → 共用時間軸／桌面圖層或 ECS 子平面。

| 檔案 | 尺寸 | 透明度驗證 |
| --- | --- | --- |
| trap_character.png | 1086×1448 RGBA | alpha 0–255；977,544 個全透明像素 |
| trap_city.png | 1448×1086 RGBA | alpha 0–255；636,694 個全透明像素 |

直接複製 PNG，不去背、不轉 JPEG、不改畫素。匯入與部署檔的 SHA-256 和來源相同；來源使用範圍僅記錄使用者授權整合本專案，不推定額外商業權利。

## 站位及動畫

`config/project.json` 的 layout 使用 target 局部座標：舞台寬1、高0.75、z0.02；人物寬0.39、高0.52、x0.015、z0.06。高度依 PNG 原始長寬比計算。ground_y=-0.15 對應舞台中央可站立地面；foot_uv=0.988 對應人物左鞋底附近。鞋底接觸面依舞台浮動／尺度同步補償；彈跳最多約0.007，不穿入地面。另一隻鞋較高的姿勢保留原圖透視。

人物左右律動、上下彈跳與呼吸尺度、舞台水平／垂直浮動、霓虹明暗由同一 audio time 計算。五段強度為 0.25／0.65／1／0.8／1.15；3秒入場，末段收束。低負載模式降低位移。沒有 CSS 自跑動畫或累加 timer，暫停時姿態與明暗固定。

兩張圖以普通 alpha blending 呈現，forceTransparent=true、depthWrite=false，人物深度位於舞台前方。桌面與 ECS 共用同一 normalized pose／寬高；ECS 只修改子平面，target 的 position／rotation／scale 不變。相關欄位依 [官方 Material 文件](https://8thwall.org/docs/api/studio/ecs/material/basic-material) 核對。

## 音效與建置

仍使用原 city_ambient.mp3，以及原先15秒裁切／尾端淡出。替換前後的 M4A SHA-256 相同：`dd9d87f1c1916c7b10c6f7fc8406fd1f9f1bb1db647a8deb7c12ab96c5d21507`。音訊回歸 fixture 記錄目前 FFmpeg 版本的位元組輸出；升級編碼器後若位元組改變，須先核對解碼結果再更新 fixture。

`build.cmd`、`start.cmd`、npm build 與測試腳本改讀 asset_mode 設定，預設 generated，不會建置完又換回舊圖片。`asset_imports` 使清除 generated 後仍可重建，無需下載任何生成模型。

已執行 build.cmd、自動化32項（Python14／Node18）、真實瀏覽器播放與暫停。新測試包含原 PNG hash／真 alpha、長寬比、前景深度、腳底接觸、霓虹／浮動變化、暫停凍結，以及音效／target／引擎完整性。預覽截圖：`reports/trap-preview.png`。

啟動：雙擊 start.cmd，開啟 <http://127.0.0.1:8080/>，點擊開始。AR 入口仍為 `/ar.html`，手機實際辨識與 HTTPS 驗收尚待執行，未在本次以桌面模擬宣稱通過。
