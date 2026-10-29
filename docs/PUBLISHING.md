# GitHub Pages 發布與手機驗收

本專案沿用現有 Git 與 GitHub Desktop。Desktop 已確認登入 amyqqqq；不要求重新登入 CLI 或安裝 Plugin。預定公開倉庫名稱 city-ar-mv，遠端建立與部署結果另記在 reports/DEPLOYMENT_REPORT.md。

## 公開內容與排除

公開原始碼、設定、新 PNG、已核對音訊、測試及原始匯出 ZIP，供 Actions 在乾淨環境重建。原始 ZIP 不作修改；隨附廠商引擎僅原樣複製並保留授權。ZIP 21MB，未包含大型生成模型；其中小型 tflite 是原 XR 引擎隨附資源。

排除 .env／Token／私鑰、.venv、node_modules、模型權重、cache、generated、dist、reports 及本機 ENV_AUDIT。`scripts/public_audit.py` 掃描 Git 公開集合及 ZIP 成員，記錄檔案／規則／行號，不輸出疑似秘密內容。這是模式掃描，不保證識別任意格式的秘密。

## 發布流程

1. 在現有專案執行測試、公開集合稽核並 commit 至 main；不強制推送。
2. GitHub Desktop → File → Add local repository，選目前 CITY_AR_MV_CODEX 根目錄。
3. Publish repository：Name=city-ar-mv，取消 Keep this code private，以 Public 發布；不建立新本機專案。
4. 倉庫 Settings → Pages → Source=GitHub Actions。Actions 的 Pages workflow 在 main push／手動執行時建置、稽核、測試並部署 dist。
5. workflow 僅授予建置 contents:read、部署 pages:write / id-token:write；不需要把 PAT 寫入專案或前端。

官方流程參考：[GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。本地原始音訊已封存為 assets/audio/trap_15s.m4a 並鎖 hash，避免 Ubuntu 與 Windows FFmpeg 版本差異改變既有音效位元組。

## 正式入口及路徑

- 根 index.html 導向 ar.html，是真正 AR 流程；不再是一般播放器。
- ar.html：原 runtime/runtime.js、xr/xr.js 與 xr-slam.js，註冊原 city_painting target，點擊啟動相機後由 ecs.application.init(scene) 啟動。
- preview.html：獨立桌面模擬播放器。
- acceptance.html：HTTPS、發布檔案、相機權限與手機驗收入口。
- 所有瀏覽器路徑均相對目前專案根目錄，支援 /city-ar-mv/ 子路徑。`scripts/check_publish.py` 驗證 artifact 及路徑。

## 手機驗收

使用真實 Android Chrome 與 iOS Safari；先開 acceptance.html，在另一螢幕／紙本顯示原辨識圖，再進入 AR。

AR 頁的紀錄來自真實 camera lifecycle 與 ECS image found／updated／lost 事件。引擎載入不代表辨識通過，音訊時鐘播放不代表使用者聽到聲音。畫面貼合與有聲需手動確認；按下載可匯出本機 JSON，不會自動上傳相機或驗收資料。

桌面相機預設停用是原場景設定。尚未在兩種手機驗證前，報告應保持待測，不能將 HTTPS 200 或預覽成功寫成追蹤成功。
