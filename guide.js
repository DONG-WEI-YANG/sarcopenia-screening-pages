(() => {
  const stage = document.querySelector(".camera-stage");
  const video = document.querySelector("#preview");
  const status = document.querySelector("#camera-status");
  const instruction = document.querySelector("#instruction");
  const start = document.querySelector("#start-camera");
  const stop = document.querySelector("#stop-camera");
  let stream;

  const copy = {
    sit: "坐站：手機朝下，讓左右腳落在兩個定位框；椅腳對齊虛線即可。",
    walk: "步行：在起點站定後，讓腳尖對準起點錨點；沿中央線直走，到終點箭頭後再停止。",
  };

  document.querySelectorAll(".mode").forEach((button) => button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    stage.dataset.mode = mode;
    document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("active", item === button));
    instruction.innerHTML = `<strong>${copy[mode].split("：")[0]}：</strong>${copy[mode].split("：")[1]}`;
  }));

  start.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      status.textContent = "此瀏覽器無法開啟鏡頭；請改用地面標示與手動計時。";
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream;
      await video.play();
      status.textContent = "鏡頭只在本機預覽。請依輔助線調整雙腳與地面位置。";
      start.hidden = true;
      stop.hidden = false;
    } catch {
      status.textContent = "未取得鏡頭權限。可改用地面標示與手動計時。";
    }
  });

  stop.addEventListener("click", () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    video.srcObject = null;
    start.hidden = false;
    stop.hidden = true;
    status.textContent = "鏡頭已關閉，沒有影像被保存。";
  });
  addEventListener("pagehide", () => stream?.getTracks().forEach((track) => track.stop()));
})();
