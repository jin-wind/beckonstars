# 星喚自架服務器

目前 APK 會連到：

```text
https://stem.tmcss.edu.hk/BeckonStars
```

## 啟動

```powershell
npm run api-server
```

本機開發伺服器預設綁定 `0.0.0.0:8787`，使用 SQLite：

```text
data\server-db.sqlite
```

## 測試

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
Invoke-RestMethod https://stem.tmcss.edu.hk/BeckonStars/api/health
```

手機可以用瀏覽器打開：

```text
https://stem.tmcss.edu.hk/BeckonStars/api/health
```

正式伺服器透過 HTTPS 反向代理將 `/BeckonStars/` 下的請求轉到 API 服務。

## API 範圍

- `POST /api/families/:familyId/connect`
- `GET /api/families/:familyId/messages`
- `POST /api/families/:familyId/messages`
- `GET /api/families/:familyId/memories`
- `POST /api/families/:familyId/memories`

正式 API 使用 HTTPS，家庭功能需登入後使用。
