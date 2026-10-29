# Phase 1 / 2 測試紀錄

## 最新：新人物與霓虹城市整合

已實際執行 `build.cmd`，預設輸出 generated 新圖版本；14 項 Python 與18項 Node 測試全部通過。新圖檔案／透明度／長寬比、腳底接觸與前景深度、霓虹浮動效果、音效 hash、target／廠商引擎完整性均有驗證。

最終建置的瀏覽器預覽已確認：Restart 在無目標時回到0秒；播放後模擬遺失目標停在0.32秒，等待後維持相同數字，再找到後續播；人物於3秒入場，手動暫停於9.81秒，畫面與效果固定。Console 無 error／warn。截圖 `reports/trap-preview.png`；整合參數與啟動方法見 `docs/NEW_ASSETS.md`。以下為先前原素材基線紀錄。

日期：2026-10-29（Asia/Taipei）。使用 Python 3.11.9 venv、Node 24.20.0 與既有 FFmpeg；沒有安裝大型模型或第三方 Python 套件。

## 自動檢查

- Python unittest：12 / 12 通過；Node test runner：15 / 15 通過。
- FFprobe：15.00 秒 AAC；`pipeline validate` 通過。
- ZIP／source_original hash 通過；輸出 target 與 external 廠商檔案逐檔 byte-identical。
- 重複 compose 通過。曾發現唯讀 baseline 屬性繼承造成 Windows 重建失敗，已修正並加入回歸測試。
- 三個原素材以 manual 匯入，寫入 metadata，generated 模式組裝／驗證通過，最後切回 original 模式。這不是 AI 生成。
- ACE-Step dry-run 回傳 PLANNED，沒有 provider 呼叫或假媒體；ComfyUI 未配置時回傳 NOT_CONFIGURED。

Python 測試涵蓋原檔／target、時長、廠商完整性、dry-run、授權必填、cache／損毀恢復、輸入變更、路徑限制及重試。JavaScript 涵蓋手勢、音訊時鐘、lost/resume offset、避免疊音、手動暫停、隱藏頁面、continue 策略、15 秒停止／重播、解鎖失敗／競態、段落邊界、manifest 錯誤及 ECS 接線。

## 瀏覽器實測

內建 Chromium 載入桌面頁，確認圖片解碼、Start 啟動 WebAudio、時間軸走到 15.00 秒結束。

- Restart 在無目標時回到 0.00 秒並等待。
- 模擬找到後開始，模擬失去後停在 0.53 秒。
- 手動暫停停在 9.55 秒；截圖 `reports/preview.png`。
- 桌面預覽 console 無 error / warn。
- 原版及新版 AR 入口載入引擎；桌面無可用 XR session manager，原場景 desktop=disabled。

尚未驗證真實相機辨識、雙手機、音畫偏差 ≤100ms 或 iOS/Android 音訊權限。AR 入口載入與模擬事件不能替代這些驗收。

## 重跑

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\test.ps1
```

完整盤點見 `docs/INVENTORY.md`，機器可讀驗證見 `reports/validation.json`，手機流程見 `docs/PHONE_TEST_CHECKLIST.md`。
