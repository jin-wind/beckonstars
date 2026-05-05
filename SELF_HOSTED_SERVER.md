# 星喚自架服務器

目前 APK 會連到：

```text
http://beckonstars.pppjj.dpdns.org
```

## 啟動

```powershell
npm run api-server
```

服務器會綁定 `0.0.0.0:8787`，資料存在：

```text
data\server-db.json
```

## 測試

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
Invoke-RestMethod http://beckonstars.pppjj.dpdns.org/api/health
```

手機可以用瀏覽器打開：

```text
http://beckonstars.pppjj.dpdns.org/api/health
```

如果手機不是同一個網絡而連不到，通常是 Windows 防火牆或路由器沒有放行 TCP 8787。

## API 範圍

- `POST /api/families/:familyId/connect`
- `GET /api/families/:familyId/messages`
- `POST /api/families/:familyId/messages`
- `GET /api/families/:familyId/memories`
- `POST /api/families/:familyId/memories`

這是測試服務器：沒有登入驗證、沒有 HTTPS、資料用 JSON 檔保存。正式版應該換成 HTTPS、資料庫和帳號驗證。
