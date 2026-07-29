(() => {
  const status = document.querySelector("#status");
  const retry = document.querySelector("#retry");
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  const apiOrigin = window.SCREENING_CONFIG?.apiOrigin?.replace(/\/$/, "");

  async function openVisit() {
    retry.hidden = true;
    if (!token) {
      status.textContent = "請使用活動提供的 QR Code 開啟此頁面。";
      return;
    }
    if (!apiOrigin) {
      status.textContent = "公開入口已發布，正在等待安全 API 啟用。";
      return;
    }
    status.textContent = "正在確認檢測連結…";
    try {
      const response = await fetch(`${apiOrigin}/api/v1/visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ visitToken: token }),
      });
      if (!response.ok) throw new Error("invalid");
      const { visitId } = await response.json();
      location.replace(`${apiOrigin}/s/${encodeURIComponent(token)}#visit=${encodeURIComponent(visitId)}`);
    } catch {
      status.textContent = "此檢測連結無效、已過期，或暫時無法連線。";
      retry.hidden = false;
    }
  }

  retry.addEventListener("click", openVisit);
  void openVisit();
})();
