# SQLite 遷移指南

## 為什麼遷移到 SQLite？

舊的 JSON 文件存儲方式存在嚴重的性能問題：

- **JSON 方式**：每次請求都需要讀取並解析整個文件（160MB+）
  - GET 請求：1-2 秒
  - POST 請求：3-4 秒

- **SQLite 方式**：使用索引直接查詢需要的數據
  - GET 請求：50-100ms
  - POST 請求：100-200ms

**性能提升約 20-60 倍** 🚀

## 遷移步驟

### 1. 備份現有數據

```bash
cp data/server-db.json data/server-db.json.backup
```

### 2. 安裝依賴

```bash
npm install
```

### 3. 運行遷移腳本

```bash
npm run migrate-to-sqlite
```

或者手動指定路徑：

```bash
node scripts/migrate-json-to-sqlite.js <json路徑> <sqlite輸出路徑>
```

示例：
```bash
node scripts/migrate-json-to-sqlite.js data/server-db.json data/server-db.sqlite
```

### 4. 配置環境變量

編輯 `.env` 文件（如果不存在則從 `.env.example` 複製）：

```env
# 數據庫路徑（改為 .sqlite）
API_DB_PATH=./data/server-db.sqlite

# 啟用 SQLite（默認已啟用）
USE_SQLITE=true
```

### 5. 重啟服務器

```bash
npm run api-server
```

### 6. 驗證

```bash
curl http://127.0.0.1:8787/api/health
```

應該返回：
```json
{"ok":true,"name":"beckon-stars-local-api","time":"...","auth":true,"googleAuth":false}
```

## 回退到 JSON（如果需要）

如果遇到問題，可以隨時切換回 JSON 模式：

```env
# .env
USE_SQLITE=false
API_DB_PATH=./data/server-db.json
```

然後重啟服務器。

## 遷移腳本功能

`scripts/migrate-json-to-sqlite.js` 會：

1. 自動備份舊的 SQLite 文件（如果存在）
2. 創建新的數據庫結構
3. 遷移所有數據：
   - 用戶（users）
   - 家庭（families）
   - 家庭成員（family_members）
   - 消息（messages）
   - 記憶（memories）
4. 創建索引以優化查詢性能

## 數據庫架構

SQLite 數據庫包含以下表：

- `users` - 用戶信息
- `user_families` - 用戶與家庭的關係
- `families` - 家庭信息
- `family_members` - 家庭成員
- `messages` - 聊天消息
- `memories` - 家庭記憶

所有表都有適當的索引以優化查詢。

## 注意事項

- SQLite 文件通常比 JSON 小很多（約 1/3 到 1/2 大小）
- SQLite 使用 WAL 模式（Write-Ahead Logging），支持並發讀寫
- 舊的 JSON 文件不會被刪除，可以保留作為備份
- 遷移腳本可以重複運行，會自動處理重複數據

## 常見問題

### Q: 遷移後數據會丟失嗎？
A: 不會。遷移腳本會自動備份舊數據庫，且原 JSON 文件不會被刪除。

### Q: 可以同時使用 JSON 和 SQLite 嗎？
A: 不能。服務器一次只能使用一種存儲方式。通過 `USE_SQLITE` 環境變量切換。

### Q: 如何驗證遷移成功？
A: 檢查服務器日誌，遷移腳本會顯示遷移的數據數量。然後測試 API 端點是否正常響應。

### Q: SQLite 文件在哪裡？
A: 默認位置：`data/server-db.sqlite`（可通過 `API_DB_PATH` 配置）

### Q: 性能提升有多大？
A: 測試顯示從 1-4 秒降低到 50-200ms，提升約 20-60 倍。
