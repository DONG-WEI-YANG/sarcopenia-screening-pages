# 肌少症風險篩檢公開入口

此 repository 只包含 GitHub Pages 靜態入口，沒有後端、管理端、資料庫連線或密鑰。

部署前在 `config.js` 設定受保護 Hugging Face Space 的 HTTPS `apiOrigin`。QR 權杖使用 URL hash `#token=...`，不會送到 Pages 伺服器日誌。
