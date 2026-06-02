# AI API 配置教程

本文件說明如何為星喚服務器配置兩個 AI 服務：

1. **Azure Speech to Text** — 語音轉文字（Fast Transcription）
2. **OpenRouter** — AI 文字摘要/總結

---

## 目錄

- [Azure Speech to Text](#azure-speech-to-text)
- [OpenRouter](#openrouter)
- [服務器配置方式](#服務器配置方式)
- [故障排查](#故障排查)

---

## Azure Speech to Text

### 1. 創建 Azure Speech 資源

1. 前往 [Azure Portal](https://portal.azure.com/)
2. 搜索 **Speech services** → 點擊 **Create**
3. 選擇資源群組（或新建）
4. **Region**：選擇 East Asia（香港/亞洲延遲最低）或 East US
5. **Pricing tier**：選擇 **Standard (S0)**
   - 免費額度：每月 **30 Audio hours**
   - 超量計費：**$1.2 / audio hour**
6. 命名你的資源，點擊 **Review + create**

### 2. 獲取 API Key 和 Endpoint

創建完成後：
1. 進入 Speech 資源的 **Overview** 頁面
2. 複製 **Endpoint**，格式類似：
   ```
   https://your-resource.cognitiveservices.azure.com/
   ```
3. 點擊左側 **Keys and Endpoint**
4. 複製 **KEY 1** 或 **KEY 2**（兩者等效）

### 3. 支持的語言

星喚已配置的語言優先順序：
- `zh-HK` — 香港廣東話
- `yue` — 粵語
- `zh-TW` — 繁體中文
- `zh-CN` — 簡體中文
- `en-US` — 英文

Azure Fast Transcription 會自動檢測語言。

### 4. 技術細節

星喚使用的 API：

```
POST https://{endpoint}/speechtotext/transcriptions:transcribe?api-version=2024-05-15-preview
```

- 音頻格式：**WAV** (已由 ffmpeg 從錄音轉換為 16kHz, mono)
- 請求方式：**multipart/form-data**
- 包含兩個字段：`audio` (二進制) 和 `definition` (JSON)
- 響應字段：`combinedPhrases[].text` 拼接為轉譯結果

### 5. 查看用量

在 Azure Portal → Speech 資源 → **Metrics**：
- `Audio Hours Transcribed` — 查看本月已用時長
- `Successfully Processed Audio` — 成功轉譯次數

---

## OpenRouter

### 1. 註冊帳號

1. 前往 [openrouter.ai](https://openrouter.ai/)
2. 點擊 **Sign in** → 可用 Google / GitHub 快速註冊

### 2. 獲取 API Key

1. 登入後訪問 [openrouter.ai/keys](https://openrouter.ai/keys)
2. 點擊 **Create Key**
3. 命名你的 Key（如 `beckonstars-production`）
4. 複製 Key，格式：
   ```
   sk-or-v1-xxxxxxxxxxxxxxxxxxxx
   ```

### 3. 模型選擇

星喚默認使用免費模型：

```
moonshotai/kimi-k2.6:free
```

可在 `OPENROUTER_MODEL` 環境變量中替換為其他模型，例如：
- `anthropic/claude-sonnet-4-20251022` — Claude Sonnet 4（付費，更強）
- `openai/gpt-4o-mini` — GPT-4o Mini（付費）
- `mistralai/mistral-small-24b-instruct-2501:free` — Mistral 免費版

### 4. 免費模型的限制

- **速率限制**：通常為 20 requests / minute
- **上下文長度**：取決於模型，通常 128K tokens
- **可用性**：高峰期可能排隊或不可用

如果頻繁出現 429 (Too Many Requests) 錯誤，建議升級到付費模型。

### 5. 技術細節

星喚使用的 API：

```
POST https://openrouter.ai/api/v1/chat/completions
```

- **格式**：完全兼容 OpenAI Chat Completions API
- **Headers**：
  - `Authorization: Bearer {key}` — 必須
  - `HTTP-Referer: {url}` — 推薦，幫助 OpenRouter 識別來源
  - `X-Title: {app_name}` — 推薦
- **System prompt**：固定為「錄音摘要器」角色，繁體中文、香港粵語
- **Temperature**：0.3（低溫度，輸出穩定）

---

## 服務器配置方式

### 方式一：直接 export（推薦，最簡單）

在啟動服務器之前執行：

```bash
export AZURE_STT_ENDPOINT="https://your-resource.cognitiveservices.azure.com/"
export AZURE_STT_KEY="your-azure-key-here"
export OPENROUTER_API_KEY="sk-or-v1-your-key-here"

# 可選
export OPENROUTER_MODEL="moonshotai/kimi-k2.6:free"
export OPENROUTER_HTTP_REFERER="https://beckonstars.app"

# 啟動服務器
npm run api-server
```

**Windows (PowerShell)**：
```powershell
$env:AZURE_STT_ENDPOINT = "https://your-resource.cognitiveservices.azure.com/"
$env:AZURE_STT_KEY = "your-azure-key-here"
$env:OPENROUTER_API_KEY = "sk-or-v1-your-key-here"

npm run api-server
```

### 方式二：PM2 環境變量

如果使用 PM2 管理服務器，在 `ecosystem.config.js` 中設置：

```javascript
module.exports = {
  apps: [{
    name: 'beckonstars',
    script: 'scripts/local-api-server.js',
    env: {
      AZURE_STT_ENDPOINT: 'https://your-resource.cognitiveservices.azure.com/',
      AZURE_STT_KEY: 'your-azure-key-here',
      OPENROUTER_API_KEY: 'sk-or-v1-your-key-here',
      OPENROUTER_MODEL: 'moonshotai/kimi-k2.6:free',
      JWT_SECRET: 'your-fixed-jwt-secret-here'
    }
  }]
};
```

然後：
```bash
pm2 start ecosystem.config.js
pm2 save
```

### 方式三：.env 文件

```bash
# 1. 安裝 dotenv（一次性）
npm install dotenv

# 2. 在服務器根目錄創建 .env 文件
cp .env.example .env
# 編輯 .env 填入實際值
vim .env

# 3. 在 local-api-server.js 最頂部添加（但我們不這樣做）
# 推薦在啟動命令中加載：
node -r dotenv/config scripts/local-api-server.js
```

---

## 故障排查

### Azure STT 錯誤

| 錯誤 | 可能原因 | 解決方案 |
|------|---------|---------|
| `azure-stt-401` | API Key 錯誤 | 檢查 `AZURE_STT_KEY` 是否正確，注意前後空格 |
| `azure-stt-404` | Endpoint 錯誤 | 確認 Endpoint URL 完整，以 `/` 結尾 |
| `azure-stt-429` | 超過速率限制 | Azure S0 有並發限制，等待後重試 |
| 轉譯結果為空 | 音頻質量差或無語音 | 檢查錄音是否清晰，或返回 `[聽不清]` |
| `ffmpeg not found` | 缺少 ffmpeg | 安裝 ffmpeg：`apt install ffmpeg` 或 `brew install ffmpeg` |

### OpenRouter 錯誤

| 錯誤 | 可能原因 | 解決方案 |
|------|---------|---------|
| `openrouter-401` | API Key 無效 | 在 OpenRouter 重新生成 Key |
| `openrouter-429` | 速率限制 | 免費模型限制 20 req/min，等待或換付費模型 |
| `openrouter-402` | 信用額度不足 | 即使是免費模型也需要少量信用，充值或換免費模型 |
| 摘要質量差 | 模型性能不足 | 嘗試 `anthropic/claude-sonnet-4-20251022` 等付費模型 |

### 日誌查看

服務器啟動後，觀察日誌中的標籤：

```
[azure-stt] ✅ 轉譯完成: 今日天氣好好 ...
[openrouter] summary failed, trying fallback ...
```

- `[azure-stt] ✅` — Azure 轉譯成功
- `[azure-stt] ... 嘗試 fallback LLM` — Azure 失敗，回退到舊 API
- `[openrouter] ...` — OpenRouter 相關日誌

### 向後兼容

如果不設置新的環境變量，服務器**完全不受影響**，繼續使用舊的 LLM API：

```bash
# 不設置 AZURE_STT_KEY 和 OPENROUTER_API_KEY
# 服務器會自動使用原有的 LLM_OPENAI_BASE_URL / LLM_SUMMARY_API_KEY
```

---

## 快速檢查清單

部署前確認：

- [ ] Azure Speech 資源已創建（Standard S0）
- [ ] 已複製 Endpoint 和 Key
- [ ] OpenRouter 帳號已註冊
- [ ] 已創建並複製 API Key
- [ ] 服務器環境變量已設置
- [ ] 服務器已重啟
- [ ] 測試語音訊息轉譯成功
- [ ] 測試 AI 摘要成功
