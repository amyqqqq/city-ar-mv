# CITY AR MV Generator

Phase 1 盤點、Phase 2 本機 pipeline 與播放器已建立，目前預設使用 `new_assets/trap_character.png` 與 `new_assets/trap_city.png`。保留原有 15 秒音效及 8th Wall ECS 入口。**手機 AR 尚未驗收；本次圖片由使用者提供，沒有呼叫生成服務或製作新音樂。**

## 新人物與霓虹城市版本

雙擊 `build.cmd` 或 `start.cmd` 會依 `config/project.json` 的 `asset_mode=generated` 匯入新圖，不會切回舊圖。測試腳本也使用此模式。新圖完整保留原始 RGBA 與長寬比；城市平面為 1×0.75、z=0.02，人物為 0.39×0.52、z=0.06。腳底接觸點、位置及比例可在 `layout` 調整。

人物左右律動／輕彈跳、舞台浮動與霓虹明暗均由音訊時鐘取樣，五段強度逐段變化；縮放中心依腳底補償，隨舞台一起移動。暫停、續播、重新播放與低負載模式仍可使用。詳見 `docs/NEW_ASSETS.md`。

`asset_imports` 記錄來源與本專案使用範圍，建置時使用既有 metadata/cache 匯入；如更換素材來源，也需更新此處。保留 `compose --mode original` 作原素材測試；不帶 mode 的建置會使用設定的新版本。

## Windows 啟動

雙擊 `start.cmd`，再開啟 <http://127.0.0.1:8080/preview.html>。腳本使用既有 Python 3.11 建立獨立 `.venv`，組裝、驗證並啟動伺服器；不下載 Python、套件或模型。需 PATH 上已有 FFmpeg / FFprobe。Ctrl+C 停止服務。

- `/preview.html`：桌面預覽；點擊「開始 / 啟用聲音」，可模擬找到／失去目標。
- `/ar.html`：手機 AR 入口；沿用 `city_painting`、原 target 幾何與引擎，需要可信任 HTTPS。原場景停用桌面 AR。
- `/original/`：未修改原版；由開發伺服器掛載唯讀副本。

`build.cmd` 只建置／驗證。CMD 的 PowerShell 執行選項僅適用當次行程，不修改系統設定。手機的 localhost 指向手機，不能直接用電腦的 localhost 網址。

## Pipeline

從專案根目錄執行，不必 activate venv：

```powershell
.\.venv\Scripts\python.exe -m pipeline doctor
.\.venv\Scripts\python.exe -m pipeline baseline
.\.venv\Scripts\python.exe -m pipeline generate --kind music --provider ace-step --dry-run
.\.venv\Scripts\python.exe -m pipeline compose --mode original --dry-run
.\.venv\Scripts\python.exe -m pipeline compose --mode original
.\.venv\Scripts\python.exe -m pipeline validate
.\.venv\Scripts\python.exe -m pipeline serve --port 8080
```

`generate --kind` 支援 music、characters、backgrounds、motion、effects。`--dry-run` 不連外、不呼叫 provider、不建立假媒體；待執行工作表寫入 `generated/plans/`。

已有可使用素材時可手動匯入：

```powershell
.\.venv\Scripts\python.exe -m pipeline generate --kind music --source C:\Media\beat.wav --license "本人原創，允許本專案使用"
.\.venv\Scripts\python.exe -m pipeline generate --kind characters --source C:\Media\performer.png --license "本人持有本專案使用授權"
.\.venv\Scripts\python.exe -m pipeline generate --kind backgrounds --source C:\Media\city.png --license "本人持有本專案使用授權"
.\.venv\Scripts\python.exe -m pipeline compose --mode generated
.\.venv\Scripts\python.exe -m pipeline validate
```

`generated` 模式選取已匯入／生成的素材，**不代表曾成功呼叫 AI**。目前可執行 provider 為 manual；comfyui、ace-step、external 是擴充插槽，未配置 workflow/API adapter 時回傳 NOT_CONFIGURED（退出碼 2）。API 金鑰不得放入 web 或 dist。

素材 metadata 包含 prompt、seed、provider、來源 hash、權利範圍及輸出 hash。`generated/jobs.jsonl` 記錄成功／失敗；相同輸入命中 cache，損毀輸出可重新匯入。只有暫時連線錯誤會重試。

## 設定與架構

`config/project.json` 是演出設定來源。固定 8th Wall／city_painting／15 秒；可調 BPM、五段時間軸及 tracking_lost_policy（預設 pause，可選 continue）。修改後重新 compose。

| 位置 | 用途 |
| --- | --- |
| pipeline/ | CLI、provider、job、FFmpeg、RMS 瞬態分析與驗證 |
| web/runtime/ | 素材載入、WebAudio clock、timeline、player、ECS bridge |
| web/index.html、web/ar.html | 桌面預覽與 8th Wall 入口 |
| config/original-lock.json | ZIP 與 source_original 的 SHA-256 保護 |
| tests/ | Python／Node 測試 |
| tests/fixtures/original_export/ | ZIP 唯讀測試副本，不納入 Git |
| generated/ | 匯入素材、15 秒 WAV、analysis、manifest、jobs |
| dist/ | 可部署播放器、素材與原樣保留的引擎／target／授權 |
| reports/ | 環境、盤點、驗證 JSON 與預覽截圖 |
| scripts/ | Windows 建置、測試、啟動 |
| original_export/、source_original/ | 原始備份及素材，不得修改 |

播放器預載圖片／解碼音訊，點擊後解鎖 WebAudio；以 AudioContext.currentTime 推導每幀姿態。預設 target lost 暫停並保留 offset，found 後續播；15 秒由音訊 source 排程停止。背景頁籤暫停，另有低負載動畫選項。AR 只修改 target 子圖層，錨點 transform 由引擎控制。

輸出 44.1kHz mono WAV、AAC/M4A、RGBA 圖層與 manifest。原版測試取 city_ambient.mp3 前 15 秒並淡出；不是新 Trap beat。五段使用程式化靜態圖層回退，尚無生成影片、分身或建築折疊。140 BPM 是設定網格，RMS 正向差分只偵測瞬態，未宣稱估算真實 BPM。Phase 2 不要求安裝 Pillow、librosa 或 pytest。

## 測試與後續

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test.ps1
```

目前 14 項 Python 與 18 項 Node 測試通過。詳見 `docs/BASELINE.md`、`docs/ENV_AUDIT.md`、`docs/TEST_RESULTS.md`。手機驗收見 `docs/PHONE_TEST_CHECKLIST.md`；下一階段見 `docs/NEEDS_INPUT.md`；完整原規格見 `docs/SPEC.md`。

Qwen/llama.cpp、Pi Agent 預設不使用。未安裝大型模型、未公開部署；external/xr 引擎及授權檔原樣保留，沒有反編譯或修改。

## GitHub Pages 發布

正式根入口會導向真正的 `ar.html`；桌面播放器改為 `preview.html`。手機驗收使用 `acceptance.html`。GitHub Desktop 與 Actions 的發布流程、公開檔案排除與驗收界限見 `docs/PUBLISHING.md`。

## 極簡手機 AR

正式 ar.html 會自動啟動相機，辨識 city_painting 後自動演出；僅音訊受限時顯示一顆「開始」。15秒結束後點畫面或重新掃描可重播。完整控制留在桌面 preview.html，桌面 ar.html?debug=1 可開發除錯，手機不顯示診斷UI。詳見 docs/MINIMAL_AR.md。新版共51項測試，手機硬體驗收另行進行。
