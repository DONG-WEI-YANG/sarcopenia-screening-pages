(() => {
  const stage = document.querySelector(".camera-stage");
  const video = document.querySelector("#preview");
  const status = document.querySelector("#camera-status");
  const cameraAlert = document.querySelector("#camera-alert");
  const instruction = document.querySelector("#instruction");
  const start = document.querySelector("#start-camera");
  const stop = document.querySelector("#stop-camera");
  const startTest = document.querySelector("#start-test");
  const stopTest = document.querySelector("#stop-test");
  const testStatus = document.querySelector("#test-status");
  const testTimer = document.querySelector("#test-timer");
  let stream;
  let timerFrame;
  let testStartedAt;
  let lastDisplayedElapsed;
  const capturedDurationsSeconds = { sit: null, walk: null };

  const capturedSit = document.querySelector("#captured-sit");
  const capturedWalk = document.querySelector("#captured-walk");
  const sarcfForm = document.querySelector("#sarcf-form");
  const calculateResult = document.querySelector("#calculate-result");
  const fallbackCalcReason = document.querySelector("#fallback-calc-reason");
  const fallbackResult = document.querySelector("#fallback-result");
  const resultBadge = document.querySelector("#result-badge");
  const resultTitle = document.querySelector("#result-title");
  const resultDetail = document.querySelector("#result-detail");
  const resultAction = document.querySelector("#result-action");

  function formatSeconds(seconds) {
    return `${seconds.toFixed(1)} 秒`;
  }

  const assist = window.ASSIST;
  // A *stale* vendor/assist.js -- one built before the offline calculator's
  // rules functions were re-exported -- still makes `assist` truthy (it has
  // the older exports like loadAssistSettings/createSpeaker/probeMotionHardware),
  // so the calculator must gate on the specific capability it needs, not on
  // the bundle's mere presence, or a click throws an uncaught error with
  // nothing rendered.
  const assistReady =
    typeof assist?.determineFinalScreeningResult === "function" &&
    typeof assist?.calculateSarcfRisk === "function" &&
    typeof assist?.calculateWalkResult === "function" &&
    typeof assist?.calculateSitToStandResult === "function" &&
    typeof assist?.finalScreeningCopy === "object";
  const panelReason = document.querySelector("#assist-panel-reason");
  const toggles = {
    imu: document.querySelector("#assist-imu"),
    camera: document.querySelector("#assist-camera"),
    speech: document.querySelector("#assist-speech"),
  };
  // Each switch gets its own reason element, mirroring AssistToggle's
  // structure: one switch's disabled explanation must never overwrite
  // another's. A phone with no Chinese voice used to show "此裝置無中文語音"
  // on load, then have the probe silently clobber it with a sensor message
  // once the operator checked 感測器檢查 — leaving 語音提示 disabled with
  // nothing on screen explaining why.
  const reasons = {
    imu: document.querySelector("#assist-imu-reason"),
    camera: document.querySelector("#assist-camera-reason"),
    speech: document.querySelector("#assist-speech-reason"),
  };
  const probeButton = document.querySelector("#assist-probe");
  let settings = assist ? assist.loadAssistSettings() : { imu: false, camera: true, speech: false };
  let speaker = { available: false, speak() {} };
  let probed = false;

  function setReason(element, message) {
    element.textContent = message ?? "";
    element.hidden = !message;
  }

  const cameraOffStatus = "相機定位輔助已關閉。";
  const cameraDefaultStatus = "點選下方按鈕，讓鏡頭只顯示腳邊地面。";

  function showCameraAlert(message) {
    cameraAlert.textContent = message;
    cameraAlert.hidden = false;
  }

  function hideCameraAlert() {
    cameraAlert.hidden = true;
  }

  // Shared by both 關閉鏡頭 and unchecking 相機定位輔助: either action must
  // actually stop the tracks and clear the preview, not just hide the video
  // element, or a participant who unchecks the switch to feel more
  // comfortable is left with a live rear camera they were told is off.
  function stopCameraStream(message) {
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    video.srcObject = null;
    start.hidden = false;
    stop.hidden = true;
    status.textContent = message;
    // The camera is now off (deliberately, via the switch, or via 關閉鏡頭),
    // so a stale denial/unsupported alert from an earlier attempt no longer
    // describes the current state.
    hideCameraAlert();
  }

  function applySettings() {
    Object.entries(toggles).forEach(([key, input]) => { input.checked = settings[key]; });
    start.disabled = !settings.camera;
    probeButton.disabled = !settings.imu;
    if (!settings.camera) {
      stopCameraStream(cameraOffStatus);
    } else if (!stream) {
      status.textContent = cameraDefaultStatus;
    }
  }

  const probeReasons = {
    denied: "未取得動作感測器權限，已改用手動計時",
    insecure_context: "需要 HTTPS 才能使用動作感測器",
    no_hardware: "目前讀不到動作感測器，已改用手動計時",
    unsupported: "目前讀不到動作感測器，已改用手動計時",
    error: "無法使用感測器，請改用手動計時",
  };

  // iOS only grants DeviceMotionEvent.requestPermission inside a user gesture,
  // so probing must never run on load: a healthy iPhone would be labelled as
  // having no sensor. Every caller below is inside a click handler.
  async function probeSensor() {
    if (!assist || !settings.imu || probed) return;
    probed = true;
    const probe = await assist.probeMotionHardware({
      secureContext: window.isSecureContext,
      hasDeviceMotion: Boolean(window.DeviceMotionEvent),
      motionTarget: window,
      requestPermission: window.DeviceMotionEvent?.requestPermission
        ? () => window.DeviceMotionEvent.requestPermission()
        : undefined,
    });
    if (probe.status === "available") return;
    toggles.imu.checked = false;
    toggles.imu.disabled = probe.status !== "denied";
    probed = probe.status === "denied" ? false : true;
    setReason(reasons.imu, probeReasons[probe.status]);
  }

  // The guide's core value is manual timing, so a missing bundle must not take
  // the page down with it.
  if (!assist) {
    Object.values(toggles).forEach((input) => { input.disabled = true; });
    probeButton.disabled = true;
    setReason(panelReason, "輔助功能暫時無法使用");
  } else {
    applySettings();
    speaker = assist.createSpeaker();
    if (!speaker.available) {
      toggles.speech.checked = false;
      toggles.speech.disabled = true;
      setReason(reasons.speech, "此裝置無中文語音");
    }
    Object.entries(toggles).forEach(([key, input]) => input.addEventListener("change", () => {
      settings = { ...settings, [key]: input.checked };
      assist.saveAssistSettings(settings);
      applySettings();
      // Toggling the switch is itself a user gesture, so probing here is safe.
      if (key === "imu" && input.checked) void probeSensor();
    }));
    // 感測器檢查 only gates whether 檢查感測器 may probe — the guide's
    // stopwatch stays manual either way. probeSensor() already no-ops while
    // the switch is off; disabling the button too makes that visible instead
    // of the button silently doing nothing when pressed.
    probeButton.addEventListener("click", () => {
      probed = false;
      setReason(reasons.imu, "");
      void probeSensor().then(() => {
        if (toggles.imu.checked) setReason(reasons.imu, "已偵測到動作感測器");
      });
    });
  }

  // The offline calculator's scoring comes from the shared rules functions
  // (see the rules-sharing comment above the calculateResult click handler
  // below), so without them -- whether the bundle failed to load entirely or
  // loaded but is stale and missing these exports -- the button must stay
  // disabled rather than fall back to a second, possibly-drifted
  // implementation. Capturing times and filling in SARC-F answers still
  // works either way -- only the final calculation is blocked.
  if (!assistReady) {
    setReason(fallbackCalcReason, "目前無法在此頁計算風險建議，請重新整理頁面；量測到的時間仍會保留。");
  }

  function readSarcfAnswers() {
    const names = ["sarcf-carry", "sarcf-walk", "sarcf-rise", "sarcf-stairs", "sarcf-falls"];
    const values = names.map((name) => {
      const checked = sarcfForm.querySelector(`input[name="${name}"]:checked`);
      return checked ? Number(checked.value) : null;
    });
    return values.some((value) => value === null) ? null : values;
  }

  // The offline calculator's ready state -- and the calculation itself --
  // depends on assistReady (see the capability-gating comment above). Gating
  // on the capability rather than mere bundle presence means a missing *or*
  // stale bundle leaves the button permanently disabled rather than
  // computing with stale/duplicated logic.
  function updateCalculateButtonState() {
    // calculateWalkResult/calculateSitToStandResult (src/lib/screening/rules.ts)
    // throw a RangeError for a non-positive duration, so require > 0 here
    // rather than merely "captured" -- a start/stop double-tap fast enough to
    // land on the same millisecond must not enable a click that throws.
    const ready =
      assistReady &&
      capturedDurationsSeconds.sit > 0 &&
      capturedDurationsSeconds.walk > 0 &&
      readSarcfAnswers() !== null;
    calculateResult.disabled = !ready;
  }

  // Defensively clear any browser-restored radio selections on load -- this is a
  // clinical scoring form and must never silently start pre-filled.
  sarcfForm.reset();

  sarcfForm.addEventListener("change", updateCalculateButtonState);

  // Scoring and the risk recommendation are computed by the exact same
  // functions the official Next.js flow uses (src/lib/screening/rules.ts,
  // re-exported through vendor/assist.js by scripts/build-assist-bundle.mjs)
  // rather than a second local implementation, so a participant gets the same
  // advice regardless of which path staff used.
  calculateResult.addEventListener("click", () => {
    if (!assistReady) return;
    const answers = readSarcfAnswers();
    if (answers === null || !(capturedDurationsSeconds.sit > 0) || !(capturedDurationsSeconds.walk > 0)) {
      return;
    }

    const sarcf = assist.calculateSarcfRisk(answers);
    const walk = assist.calculateWalkResult(capturedDurationsSeconds.walk);
    const sitToStand = assist.calculateSitToStandResult(capturedDurationsSeconds.sit);
    const result = assist.determineFinalScreeningResult({ sarcf, walk, sitToStand });
    const copy = assist.finalScreeningCopy[result];

    fallbackResult.dataset.result = result;
    resultBadge.textContent = copy.badge;
    resultTitle.textContent = copy.title;
    resultDetail.textContent = `SARC-F 分數 ${sarcf.score}／五次坐站 ${formatSeconds(capturedDurationsSeconds.sit)}／6 公尺步行 ${formatSeconds(capturedDurationsSeconds.walk)}（速度約 ${walk.speedMps.toFixed(2)} m/s）`;
    // #result-action is new in this revision. frontend/ is hand-copied to the
    // Pages repo, so a deploy that ships this file without the matching HTML
    // would otherwise throw here and leave the participant staring at nothing.
    if (resultAction) resultAction.textContent = copy.action;
    fallbackResult.hidden = false;
    fallbackResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  const copy = {
    sit: "坐站：手機朝下，讓左右腳落在兩個定位框；椅腳對齊虛線即可。",
    walk: "步行：在起點站定後，讓腳尖對準起點錨點；沿中央線直走，到終點箭頭後再停止。",
  };

  function selectedMode() {
    return stage.dataset.mode === "walk" ? "6 公尺步行" : "五次坐站";
  }

  // Matches manual-timer.tsx so staff never convert between two formats when
  // copying a result into the official flow.
  function formatElapsed(milliseconds) {
    return `${(Math.round(milliseconds / 100) / 10).toFixed(1)} 秒`;
  }

  function updateTimer(now) {
    const formatted = formatElapsed(now - testStartedAt);
    // Only touch the DOM when the displayed tenth-of-a-second value actually
    // changes (~10/sec, not every ~60Hz animation frame), so the running
    // timer doesn't compete with touch input on the start/stop buttons.
    if (formatted !== lastDisplayedElapsed) {
      lastDisplayedElapsed = formatted;
      testTimer.value = formatted;
    }
    timerFrame = requestAnimationFrame(updateTimer);
  }

  function stopActiveTest(message) {
    if (testStartedAt === undefined) return;
    const mode = stage.dataset.mode;
    cancelAnimationFrame(timerFrame);
    const elapsed = performance.now() - testStartedAt;
    testStartedAt = undefined;
    stage.dataset.testing = "false";
    testTimer.value = formatElapsed(elapsed);
    startTest.hidden = false;
    stopTest.hidden = true;
    document.querySelectorAll(".mode").forEach((button) => { button.disabled = false; });
    testStatus.textContent = message ?? `${selectedMode()} 已停止：${testTimer.value}。請將時間手動填入正式篩檢流程。`;
    if (settings.speech) speaker.speak(`測試完成，${testTimer.value}`);

    // Only a clean stop (no message -- i.e. not the pagehide bailout) counts
    // as a captured measurement for the offline calculator, matching the
    // stopwatch's own "no data preserved" copy on the abandoned-page path.
    if (!message && (mode === "sit" || mode === "walk")) {
      // Round to a tenth here -- the same granularity the timer displays and
      // the same rounding manual-timer.tsx applies before scoring -- so the
      // captured value that feeds the calculator always matches what the
      // participant sees. Scoring the raw millisecond value let a duration
      // within 0.05s of a threshold (e.g. 11.96s, displayed 12.0 秒) score on
      // the wrong side of it, and let a sub-tenth double-tap (e.g. 30ms,
      // displayed 0.0 秒) through the `> 0` guard below where the official
      // timer would refuse to record it.
      capturedDurationsSeconds[mode] = Math.round(elapsed / 100) / 10;
      (mode === "sit" ? capturedSit : capturedWalk).textContent = formatSeconds(
        capturedDurationsSeconds[mode],
      );
      fallbackResult.hidden = true;
      updateCalculateButtonState();
    }
  }

  document.querySelectorAll(".mode").forEach((button) => button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    stage.dataset.mode = mode;
    document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("active", item === button));
    instruction.innerHTML = `<strong>${copy[mode].split("：")[0]}：</strong>${copy[mode].split("：")[1]}`;
    testTimer.value = "0.0 秒";
    testStatus.textContent = `已選擇${selectedMode()}；請就定位後由受測者按下開始。`;
  }));

  start.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = "此瀏覽器無法開啟鏡頭；請改用地面標示與手動計時。";
      showCameraAlert("此瀏覽器無法開啟鏡頭；請改用地面標示與手動計時。鏡頭並非必要條件。");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream;
      await video.play();
      hideCameraAlert();
      status.textContent = "鏡頭只在本機預覽。請依輔助線調整雙腳與地面位置。";
      start.hidden = true;
      stop.hidden = false;
    } catch {
      status.textContent = "未取得鏡頭權限。可改用地面標示與手動計時。";
      showCameraAlert("未取得鏡頭權限。鏡頭並非必要條件，可直接用地面標示與手動計時繼續測試。");
    }
  });

  stop.addEventListener("click", () => stopCameraStream("鏡頭已關閉，沒有影像被保存。"));

  startTest.addEventListener("click", () => {
    testStartedAt = performance.now();
    stage.dataset.testing = "true";
    startTest.hidden = true;
    stopTest.hidden = false;
    document.querySelectorAll(".mode").forEach((button) => { button.disabled = true; });
    testStatus.textContent = `${selectedMode()} 進行中；完成後請按停止。`;
    testTimer.value = "0.0 秒";
    lastDisplayedElapsed = "0.0 秒";
    if (settings.speech) speaker.speak("開始");
    timerFrame = requestAnimationFrame(updateTimer);
  });

  stopTest.addEventListener("click", () => stopActiveTest());
  addEventListener("pagehide", () => {
    stopActiveTest("本項測試已因離開頁面而停止，沒有資料被保存。");
    stream?.getTracks().forEach((track) => track.stop());
  });
})();
