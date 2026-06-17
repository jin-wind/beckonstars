# AI 圖片生成 API 說明文檔

## 概述

星喚應用內建 AI 圖片生成功能，用戶可上傳一張參考照片，選擇藝術風格後一鍵生成風格化圖片。後端使用 Google AI Sandbox 圖片生成服務，通過 OpenAI 兼容的 Chat Completions API 調用。

## API 配置

| 項目 | 值 |
|------|-----|
| 端點 | `http://144.79.170.102:8000/v1/chat/completions` |
| 認證 | `Bearer han1234` |
| 模型 | `gemini-3.1-flash-image-landscape` |
| 協議 | OpenAI Chat Completions 兼容 |
| 生成數量 | 每次 1-4 張（通過 `n` 參數控制） |

## 請求格式

```json
POST http://144.79.170.102:8000/v1/chat/completions
Content-Type: application/json
Authorization: Bearer han1234

{
  "model": "gemini-3.1-flash-image-landscape",
  "n": 4,
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "藝術風格提示詞..."
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,/9j/4AAQ..."
          }
        }
      ]
    }
  ],
  "stream": false
}
```

### 參數說明

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `model` | string | 是 | 固定為 `gemini-3.1-flash-image-landscape` |
| `n` | integer | 否 | 生成圖片數量，1-4，默認 1 |
| `messages` | array | 是 | 多模態消息，包含 text 和 image_url |
| `messages[].content` | array | 是 | `[{type:"text",...}, {type:"image_url",...}]` |
| `stream` | boolean | 否 | 固定為 `false`（不支持流式） |

## 響應格式

### 單張圖片（n=1）

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "flow2api",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "![Generated Image](https://flow-content.google/image/...)"
      },
      "finish_reason": "stop"
    }
  ]
}
```

### 多張圖片（n=4）

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "flow2api",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "![Generated Image](https://flow-content.google/image/aaa...)"
      },
      "finish_reason": "stop"
    },
    {
      "index": 1,
      "message": {
        "role": "assistant",
        "content": "![Generated Image](https://flow-content.google/image/bbb...)"
      },
      "finish_reason": "stop"
    },
    {
      "index": 2,
      "message": {
        "role": "assistant",
        "content": "![Generated Image](https://flow-content.google/image/ccc...)"
      },
      "finish_reason": "stop"
    },
    {
      "index": 3,
      "message": {
        "role": "assistant",
        "content": "![Generated Image](https://flow-content.google/image/ddd...)"
      },
      "finish_reason": "stop"
    }
  ]
}
```

圖片以 Markdown 格式嵌入在各 `choices[].message.content` 中，每個 choice 對應一張圖片，URL 指向 `flow-content.google` 域名的臨時圖片地址。

## 圖片處理流程

```
用戶上傳照片 → 轉為 base64 data URL
        ↓
選擇風格 → 對應英文提示詞
        ↓
發送請求（提示詞 + 參考圖片）
        ↓
API 返回 Markdown 圖片 URL
        ↓
正則提取 ![](https://...) 中的 URL
        ↓
fetch 下載圖片 → FileReader 轉 base64
        ↓
顯示生成圖片
```

### 代碼位置

`android/app/src/main/assets/index.html` 第 4638-4710 行：

- `requestSingleAIImage(prompt, refImage, count)` — 發送請求並解析響應，返回圖片數組
- 遍歷 `result.choices[]` 提取每個 choice 中的圖片
- 正則提取：`/!\[.*?\]\((https?:\/\/[^)]+)\)/g` 匹配 Markdown 圖片
- 備用提取：`/(data:image\/[^,\s]+[^)\s]*)/g` 匹配內聯 base64

## 風格列表

| 風格 | 鍵名 | 說明 |
|------|------|------|
| 隨機風格 | `random` | 使用默認中文提示詞，AI 自動決定 |
| 中式庭園 | `garden` | 傳統中式園林，竹林櫻花，晨光氛圍 |
| 爆炸動作 | `explosion` | 動作片爆炸場景，主體保持平靜表情 |
| 影樓風格 | `studio` | 專業影樓，均勻燈光，淺灰背景 |
| 復古照片 | `vintage` | 膠片顆粒感，溫暖褪色色彩 |

## 錯誤處理

### HTTP 狀態碼

| 狀態碼 | 含義 | 用戶提示 |
|--------|------|----------|
| 401 | 認證失敗 | 服務器認證失敗，請聯系管理員更新賬號憑證 |
| 403 | 禁止訪問 | 服務器認證失敗 |
| 429 | 請求過頻 | 請稍後再試 |
| 500+ | 服務器錯誤 | 請稍後再試 |

### 響應錯誤

| 錯誤信息 | 含義 | 用戶提示 |
|----------|------|----------|
| `Unauthorized` | Token 無效 | 服務器認證失敗 |
| `沒有可用賬號` | Google 帳號憑證過期 | 服務器賬號憑證已過期 |
| `captcha` / `recaptcha` | 觸發人機驗證 | 請稍後再試 |
| `響應中未找到圖片數據` | 響應不含圖片 | 生成失敗，請重試 |

### 401 錯誤排查

Google 帳號的 session token 過期時會返回 401。需要在服務器端重新登錄 Google Flow 帳號更新 cookies。詳見 `FIX_401_ERROR.md`。

## 測試命令

### PowerShell

```powershell
$body = @{
    model = "gemini-3.1-flash-image-landscape"
    n = 4
    messages = @(@{
        role = "user"
        content = @(
            @{
                type = "text"
                text = "A cute cat playing in a garden"
            }
        )
    })
    stream = $false
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Method Post `
  -Uri "http://144.79.170.102:8000/v1/chat/completions" `
  -Headers @{"Authorization"="Bearer han1234"; "Content-Type"="application/json"} `
  -Body $body
```

### curl

```bash
curl -X POST http://144.79.170.102:8000/v1/chat/completions \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-flash-image-landscape",
    "n": 4,
    "messages": [{"role": "user", "content": "A cute cat playing in a garden"}],
    "stream": false
  }'
```

### 帶參考圖片

```bash
curl -X POST http://144.79.170.102:8000/v1/chat/completions \
  -H "Authorization: Bearer han1234" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3.1-flash-image-landscape",
    "n": 4,
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "Transform this photo into a vintage style"},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,/9j/4AAQ..."}}
      ]
    }],
    "stream": false
  }'
```

## 已知限制

- 每次請求最多生成 4 張圖片（通過 `n` 參數控制，範圍 1-4）
- 需要能訪問 `http://144.79.170.102:8000`（HTTP 明文）
- 需要能訪問 `https://flow-content.google`（下載生成圖片）
- 參考圖片建議小於 5MB，過大可能超時
- 生成時間約 10-30 秒（多張圖片時間更長）
- Google 帳號 session token 會過期，需定期更新

## 版本歷史

| 版本 | 日期 | 變更 |
|------|------|------|
| v1.8 | 2026-06-18 | 支持單次請求生成 1-4 張圖片（n 參數） |
| v1.4+ | 2026-06-16 | 使用 image_url 多模態格式，自動下載遠程圖片 URL |
| v1.3 | 2026-06-16 | 遷移到 OpenAI Chat Completions API |
| v1.2 | 2026-06-16 | 添加 account 參數 |
| v1.0 | 2026-06-16 | 初始實現，使用 /api/generate 端點 |

## 相關文檔

- `AI_IMAGE_GENERATION.md` — 原始功能文檔（舊 API 格式）
- `AI_IMAGE_FINAL.md` — v1.4 版本文檔
- `API_MIGRATION.md` — API 遷移記錄
- `FIX_401_ERROR.md` — 401 錯誤排查指南
- `COMPLETE_FINAL.md` — 項目完成總結
