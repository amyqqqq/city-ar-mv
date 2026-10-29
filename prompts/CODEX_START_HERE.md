# 貼給 Codex 的第一則指令

你是本專案的資深 WebAR / AI 媒體管線工程師。請直接讀取本資料夾 `docs/SPEC.md`, `config/project.json`, `original_export/html-export-20261022T033950485Z.zip`，然後開始工作，不要只輸出方案。

核心不可變：**8th Wall + city_painting 圖像錨點 + 15 秒**；全部視覺與聲音素材可以換成 AI 生成；超現實實驗 Trap、虛構寫實真人角色、純原創 Trap Beat；人物、場景、動作、特效優先 AI 生成。原匯出包永遠不可修改。

本機 Qwen/llama.cpp、Pi Agent **完全非必要，預設不使用**。Codex 是開發代理。ComfyUI/ACE-Step 是可選的生成 provider，安裝前先偵測既有環境；GTX 1650 4GB 並不保證能生成影片。若生成服務缺失，先完成 provider 接口、dry-run、素材匯入與低負載動畫 fallback，不得宣稱生成已成功。

請按照以下分階段**實際修改程式與執行測試**：

PHASE 1 盤點與 baseline：解開 ZIP 至唯讀測試目錄；列出檔案、事件、target 名稱、音效問題，建立 `docs/ENV_AUDIT.md`, `docs/BASELINE.md`，保證原 target 配置不變。
PHASE 2 建立本機 Python pipeline：`doctor`, `generate`, `compose`, `validate`, `--dry-run`；provider 抽象、retry/cache/metadata/config/test，保留本機 ComfyUI、ACE-Step 和外部可授權 provider 的插槽。
PHASE 3 建立 15 秒 AI 製作 workflow：角色一致性參考圖、城市分層、5 段鏡頭、音樂節拍/瞬態圖、動作素材 alpha matte、壓縮輸出、manifest。
PHASE 4 以官方 8th Wall 能力重建可維護原始碼 + image target tracking、啟動聲音手勢、target lost/resume、以 audio clock 同步的 MV timeline、人物與城市分層動畫及低端 fallback。
PHASE 5 完成自動測試 + HTTPS 手機測試清單 + Windows 一鍵啟動/建置腳本 + README 使用說明。

每一階段請產生真正的檔案並測試；記錄完成與尚未完成項目。不可把概念示意當成可運行成果。只在不可逆操作、需要憑證/付款或需要設備許可時要求使用者確認。先從 PHASE 1 和 PHASE 2 開始。
