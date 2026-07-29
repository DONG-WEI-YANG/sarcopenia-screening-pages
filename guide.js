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

  // Must stay in sync with SCREENING_POLICY in the main app's
  // src/lib/screening/constants.ts (policy version AWGS_2019).
  const SCREENING_POLICY = {
    sarcfElevatedScore: 4,
    walkDistanceMeters: 6,
    walkLowPerformanceMps: 1,
    sitToStandSlowSeconds: 12,
  };

  const capturedSit = document.querySelector("#captured-sit");
  const capturedWalk = document.querySelector("#captured-walk");
  const sarcfForm = document.querySelector("#sarcf-form");
  const calculateResult = document.querySelector("#calculate-result");
  const fallbackResult = document.querySelector("#fallback-result");
  const resultBadge = document.querySelector("#result-badge");
  const resultTitle = document.querySelector("#result-title");
  const resultDetail = document.querySelector("#result-detail");

  function formatSeconds(seconds) {
    return `${seconds.toFixed(1)} 秒`;
  }

  function readSarcfScore() {
    const names = ["sarcf-carry", "sarcf-walk", "sarcf-rise", "sarcf-stairs", "sarcf-falls"];
    const values = names.map((name) => {
      const checked = sarcfForm.querySelector(`input[name="${name}"]:checked`);
      return checked ? Number(checked.value) : null;
    });
    if (values.some((value) => value === null)) return null;
    return values.reduce((total, value) => total + value, 0);
  }

  function updateCalculateButtonState() {
    const ready =
      capturedDurationsSeconds.sit !== null &&
      capturedDurationsSeconds.walk !== null &&
      readSarcfScore() !== null;
    calculateResult.disabled = !ready;
  }

  // Defensively clear any browser-restored radio selections on load -- this is a
  // clinical scoring form and must never silently start pre-filled.
  sarcfForm.reset();

  sarcfForm.addEventListener("change", updateCalculateButtonState);

  calculateResult.addEventListener("click", () => {
    const sarcfScore = readSarcfScore();
    if (sarcfScore === null || capturedDurationsSeconds.sit === null || capturedDurationsSeconds.walk === null) {
      return;
    }

    const sarcfElevated = sarcfScore >= SCREENING_POLICY.sarcfElevatedScore;
    const walkSpeedMps = SCREENING_POLICY.walkDistanceMeters / capturedDurationsSeconds.walk;
    const walkLow = walkSpeedMps < SCREENING_POLICY.walkLowPerformanceMps;
    const sitToStandSlow = capturedDurationsSeconds.sit >= SCREENING_POLICY.sitToStandSlowSeconds;
    const noObviousRisk = !sarcfElevated && !walkLow && !sitToStandSlow;

    fallbackResult.dataset.result = noObviousRisk ? "no_obvious_risk" : "consult_professional";
    resultBadge.textContent = noObviousRisk ? "✓ 風險較低" : "⚠ 建議諮詢專業評估";
    resultTitle.textContent = noObviousRisk ? "目前篩檢未見明顯風險" : "建議諮詢醫師或醫療專業人員";
    resultDetail.textContent = `SARC-F 分數 ${sarcfScore}／五次坐站 ${formatSeconds(capturedDurationsSeconds.sit)}／6 公尺步行 ${formatSeconds(capturedDurationsSeconds.walk)}（速度約 ${walkSpeedMps.toFixed(2)} m/s）`;
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

  function formatElapsed(milliseconds) {
    const tenths = Math.floor(milliseconds / 100) % 10;
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  function updateTimer(now) {
    const formatted = formatElapsed(now - testStartedAt);
    // Only touch the DOM when the displayed tenth-of-a-second value actually
    // changes (~10/sec, not every ~60Hz animation frame), so the running timer
    // doesn't compete with touch input on the start/stop buttons.
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

    if (!message && (mode === "sit" || mode === "walk")) {
      capturedDurationsSeconds[mode] = elapsed / 1000;
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
    testTimer.value = "00:00.0";
    testStatus.textContent = `已選擇${selectedMode()}；請就定位後由受測者按下開始。`;
  }));

  function showCameraAlert(message) {
    cameraAlert.textContent = message;
    cameraAlert.hidden = false;
  }

  function hideCameraAlert() {
    cameraAlert.hidden = true;
  }

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

  stop.addEventListener("click", () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    video.srcObject = null;
    start.hidden = false;
    stop.hidden = true;
    hideCameraAlert();
    status.textContent = "鏡頭已關閉，沒有影像被保存。";
  });

  startTest.addEventListener("click", () => {
    testStartedAt = performance.now();
    stage.dataset.testing = "true";
    startTest.hidden = true;
    stopTest.hidden = false;
    document.querySelectorAll(".mode").forEach((button) => { button.disabled = true; });
    testStatus.textContent = `${selectedMode()} 進行中；完成後請按停止。`;
    testTimer.value = "00:00.0";
    lastDisplayedElapsed = "00:00.0";
    timerFrame = requestAnimationFrame(updateTimer);
  });

  stopTest.addEventListener("click", () => stopActiveTest());
  addEventListener("pagehide", () => {
    stopActiveTest("本項測試已因離開頁面而停止，沒有資料被保存。");
    stream?.getTracks().forEach((track) => track.stop());
  });
})();
