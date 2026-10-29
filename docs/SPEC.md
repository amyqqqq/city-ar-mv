# CITY AR MV Generator — Codex 實作規格 v1.0

## 0. 目標與不可變約束
- 維持 **8th Wall** 的影像追蹤架構，辨識名稱固定 `city_painting`，沿用 ZIP 的辨識圖與幾何校正，除非驗證必要不可改錨點。
- 替換人物、城市影像、音樂、人物動作、特效，素材由 AI 優先生成。原素材保存在 `source_original/` 供回退及尺度對齊。
- 展現 **15.0 秒** 超現實實驗 Trap AR MV，真人寫實的虛構成年表演者、純原創無人聲 Trap Beat。
- AR 演出是錨定於 `city_painting` 的分層體驗，不是離開 AR 播放滿版影片。
- Codex 是**開發代理**，不需要執行時存在；本機 Qwen/llama.cpp 和 Pi Agent **可選且預設停用**，不得成為必裝依賴。
- 尊重原始 `external/xr` 的授權條件，不反編譯或修改閉源引擎；新實作基於官方支持的 8th Wall SDK/API。先驗證現有匯出頁面能否在實際 HTTPS 手機環境運行。

## 1. 已核對的 ZIP 資訊
- `bundle.js`（9,513 bytes）、`index.html`（866 bytes），是網頁發佈匯出，**不是完整未編譯 ECS 原始工程**。
- `image-targets/city_painting.json`：`type=PLANAR`、`name=city_painting`、`isRotated=true`，影像來源為 `city_painting_luminance.jpg`。
- 素材：`assets/night_city.png`、`assets/character.png`、`assets/city_ambient.mp3`、`assets/Threads_.mp3`。
- `bundle.js` 已宣告 `T01 AR Canvas Audio`、`T01 AR Canvas Fade`，包含 IMAGE_FOUND/IMAGE_LOST 與觸控播放事件；場景中有 `NightCityOver`、`Chracter`。
- 現有音訊需測試 iOS/Android 使用者手勢啟動，不能承諾掃描瞬間自動有聲。
- 先撰寫 Inventory Report 與現有行為測試。**若缺少 editor 原始碼，不可假定編譯匯出等同可原位修改**，須重建 ECS 組件。

## 2. 目標架構
```
Codex (build-time developer)
  -> Python 3.11/3.12 pipeline controller (CLI and optional local UI)
      -> concept/storyboard (static spec or optional LLM provider)
      -> ImageProvider (ComfyUI local / compatible remote / manual import)
      -> MotionProvider (I2V API / offline compositing Ken Burns + mesh animation)
      -> MusicProvider (ACE-Step local / licensed generative API / manual import)
      -> AudioAnalyzer (librosa or basic onset detector)
      -> AssetPreprocessor (FFmpeg + Pillow; alpha mattes)
      -> manifest.json + mobile media files
  -> 8th Wall runtime (camera + image target + timeline + 2.5D planes)
```
**不得把 API 金鑰放在瀏覽器端。** AI 素材生成採製作期離線工作流，AR 網站只載入經處理的靜態檔。

## 3. MVP 預定視覺段落（全部為新 AI 素材）
| 秒數 | 畫面 | 音樂/事件 | 技術 |
|---|---|---|---|
| 0–3 | 偏暗城市逐層喚醒，霓虹亮起 | intro → downbeat | 3–5 透明 PNG/webp 平面、亮度控制 |
| 3–6 | 虛構成人真人主角浮到前景，開始動作 | kick/snare + 低頻 | 去背人物 webm/mp4 + 遮罩或透明序列 |
| 6–9 | 主角重影、錯位分身、尺度跳動 | 808 accent | 程式重複 layer、shader 或 sprite |
| 9–12 | 建築折疊、旋轉、時間錯位 | hi-hat roll | 分層位移、輕量 GPU shader |
| 12–15 | 高潮快切、環境收束回定位 | final impact/tail | beat-driven timeline |
- 音樂以 140 BPM 作預設，不強制 AI 模型精確輸出，**實際產物使用節拍/瞬態分析校正**。
- 角色一致性：一位固定虛構成年人物；固定 seed/reference image/服裝，逐鏡檢測面容差異，出錯則重生或只使用單一去背人物動畫。
- 圖層不要過度堆砌：第一版最多 6 個同時高解析動態材質，合理控制手機記憶體。

## 4. 自動生成器的輸入與輸出
`config/project.json` 為單一設定來源。執行命令（由 Codex 實作後才可使用）：
```
python -m pipeline doctor
python -m pipeline generate --kind music
python -m pipeline generate --kind characters
python -m pipeline generate --kind backgrounds
python -m pipeline generate --kind motion
python -m pipeline compose
python -m pipeline validate
```
- 需有 `--dry-run`，不連外、不消耗額度，生成待執行工作表。
- 任務須可中斷恢復：`jobs.sqlite` 或 JSONL 記錄 prompt, seed, provider, hash, license, output path, status, errors。
- 對不支援的 provider 要明確顯示 `NOT_CONFIGURED`，不能假裝已生成。
- 每個素材建立 metadata，記錄來源/模型/版權及權利範圍，下載網路素材需要明確許可；不得直接擷取有版權的商業 MV 音樂。
- 生成輸出 `generated/audio/trap_15s.wav`（最後壓縮 AAC）、`generated/characters/`、`generated/backgrounds/`、`generated/motion/`、`generated/effects/`，以及 `generated/manifest.json`。
- 保留原場景可視作原素材比對模式（`original` vs `generated`），不覆寫 zip。

## 5. 提供者選擇與硬體路由
- 本機設備：Windows 10、Ryzen 5 2600、16GB RAM、GTX 1650 4GB。
- `FFmpeg`, `Python`, `Pillow`, `pytest` 在 Windows 可做編排與格式轉換。
- `ComfyUI`: 先偵測是否安裝與 API 是否可用，**不得假設已啟動**；優先小型 SD 1.5 / 512–768px image，低顯存適配。若畫質不符需保留高品質遠端 provider。
- `ACE-Step 1.5`: 4GB 官方策略為 DiT-only、INT8、CPU offload；先做 15 秒測試，不保證效能。音樂生成失敗須可使用使用者提供的可授權素材或其他服務。
- `Motion`: 4GB VRAM 不預設硬跑大型 video diffusion。首選 AI 圖像 + 程式化可控動作，次選 I2V cloud provider；產生人物去背/alpha mask 並檢測透明邊緣。
- `Qwen llama.cpp` 與 `Pi Agent`: 可選擴充，**預設停用**；不用它們也要能跑完整流程。Codex 可直接建立腳本和預設 storyboard。

## 6. 8th Wall 執行流程
1. 用 ZIP 內 original image 與 target JSON 回歸測試追蹤；手機 HTTPS + 相機權限。
2. 顯示 Start/Enable Sound 明確按鈕，解鎖 WebAudio / HTML media；掃描後載入素材或預載完成再允許啟動。
3. 找到 `city_painting` → 以 target anchor 的 scale 與 transform 貼合原始畫面；畫面表演使用多層平面/動態材質。
4. 首次使用者點擊 → 建立單一 master audio clock (`AudioContext.currentTime` 或媒體播放時鐘)；以音訊時鐘推導影像時間，不依靠 JS timer 累加。
5. target lost → 暫停或保持音樂策略要可設定（預設 pause）；target found → resume 不從頭跳；再次點擊 Restart 可重播 15 秒。
6. 影片/動畫替代格式：Safari 優先 MP4 H.264 + 額外 alpha mask，支援時可用透明 webm；不可只依賴透明 webm。
7. 內容應有低階手機 fallback：靜態分層、CSS/ECS 動畫與預錄音訊，可選關閉粒子或位移。
8. AI 生成內容只在 build 階段產生；部署資料不包含模型檔與生成 API 金鑰。

## 7. 安裝及開發步驟（由 Codex 偵測後執行）
1. `git init` 新工作目錄；不得改動原始 ZIP。
2. 偵測 `python --version`, `ffmpeg -version`, `nvidia-smi`, `git --version`、ComfyUI API / 已有設定，輸出 `docs/ENV_AUDIT.md`；未安裝才建議官方來源。
3. Python 建議獨立 3.11/3.12 venv，避免覆蓋原 Python 3.14 與既有 ComfyUI 依賴；`pip install pillow pydantic numpy librosa soundfile pytest requests`（依實作可刪）。
4. 實作 Provider 抽象介面及 `dry-run` / `doctor`；所有遠端 provider 必須由使用者明確設定。
5. 先建立合法可生成或可匯入的 15 秒音樂，再建角色、場景、動作及 metadata。
6. 實作 Timeline + 音頻同步，整合新 8th Wall 專案，手動測試 Android Chrome 和 iOS Safari。
7. 以 `npm` 工作流構建，保持 XR 原碼與廠商引擎分離。版本選擇與 migration 依當前官方文件先做 PoC，而不是直接換引擎。
8. 建 CI 可運行單元測試；生成器服務不能當作無需人工審核的商業發佈管線。

## 8. 驗收條件
- 原始 target 辨識結果穩定；至少在 2 種手機上測試，記錄 target tracking 成功及 target lost/resume 行為。
- 點擊 Start 後音樂可播放，且畫面與聲音 15 秒時間軸保持同步（實測偏差目標 ≤ 100 ms）。
- 產出 1 位一致的人物、3 種都市空間視覺、1 軌原創 trap beat、5 個主要時間段，顯示可見動作與節拍效果。
- 使用者可以只修改設定 + 重新生成部分素材，不重建目標或修改 AR 底層。
- 所有生成輸出有 metadata 和授權；當生成器不可用時 fail gracefully，不偽造輸出。
- 手機無法播放透明 webm 時，至少還有 H.264 + mask / PNG sprite fallback。
- 原始發佈版本可與新版分開執行，提供回退方案。

## 9. 專案外的注意事項
- 8th Wall 2026 開源框架含 Image Targets，SLAM 功能在獨立 binary；保留官方授權與升級約束。
- 不能從匯出 ZIP 推斷完整編輯器工程；若需要原始 ECS 程式庫、雲端項目設定或素材工程，請把缺失列入 `docs/NEEDS_INPUT.md`，但先用現有檔案完成最大程度 PoC。
- 寫實真人應使用明確為虛構的 AI 人物，不冒充已知真人。
