# 極簡全螢幕 AR

正式入口與 QR URL 保持 `https://amyqqqq.github.io/city-ar-mv/ar.html`，GitHub Pages 流程不變。

- 開頁即啟動真實 ECS/XR 相機；target／scene 載入與 PNG／音訊解碼並行。影像 target 的名稱、JSON、辨識圖及廠商引擎沒有修改。
- 手機沒有標題、導覽、教學、狀態列、時間軸、播放控制或 Debug。黑底 full viewport、viewport-fit=cover、零 margin／padding，正常畫面只留相機與 AR 圖層。廠商引擎自帶的授權標示不刪除。
- AudioContext 已允許播放時，辨識成功直接播放；被瀏覽器暫停時才顯示單一「開始」。實際點擊同步呼叫 resume，不在非手勢的 suspended resume 上等待。正常一次啟用後，不因 lost/found 或重播再次提示；若作業系統中斷後瀏覽器重新要求手勢，仍使用同一個按鈕恢復。
- 15秒以 audio clock 驅動。target lost 預設暫停，找回從原 offset 續播。演出結束後點畫面重播，或移開再重新掃描；不顯示重播控制列。
- 只有相機失敗或 AR 初始化失敗才顯示短訊息與重試；重試重新載入頁面，不嘗試繞過權限。
- 桌面 `preview.html` 保留完整測試控制；`ar.html?debug=1` 僅桌面顯示 AR 診斷。Android、iPhone、iPad（含桌面 UA）不顯示該面板。

自動測試共51項：既有39項，加9項自動播放／隱藏UI測試與3項 production bootstrap 整合測試。bootstrap 的硬體與相機使用 mock，驗證 XR 不等媒體解碼、真正 tracking 事件接線、手勢音訊、無UI重播及失敗顯示；不計入實機驗收。

待手機實測：首次相機請求、滿版尺寸／旋轉、iOS Safari／Android Chrome 的音訊手勢與背景恢復、實體圖像辨識與貼合、15秒播放及點畫面重播。

音訊限制依 [MDN autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) 與 [AudioContext.resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume) 處理。程式不宣稱能繞過瀏覽器限制。
