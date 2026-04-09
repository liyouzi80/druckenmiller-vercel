# Druckenmiller Conviction — Vercel Deployment

## 準備 API Keys

| 服務 | 申請地址 | 用途 |
|---|---|---|
| FRED | https://fred.stlouisfed.org/docs/api/api_key.html | M2、Fed Funds Rate |
| FMP | https://financialmodelingprep.com/developer/docs | 盈利、廣度、價格 |

## 部署步驟

### 1. Push 到 GitHub

```bash
git init
git add .
git commit -m "init druckenmiller conviction pipeline"
git remote add origin https://github.com/YOUR_USERNAME/druckenmiller-conviction.git
git push -u origin main
```

### 2. Import 到 Vercel

1. 前往 https://vercel.com/new
2. 選擇你的 GitHub repo
3. Framework Preset: **Other**
4. 點 Deploy

### 3. 設置環境變量

在 Vercel Project → Settings → Environment Variables 添加：

```
FRED_API_KEY      = xxxx
FMP_API_KEY       = xxxx
CRON_SECRET       = (隨機字符串，用於手動觸發)
```

### 4. 手動觸發第一次生成

部署完後訪問：
```
https://your-project.vercel.app/api/generate?secret=YOUR_CRON_SECRET
```

返回 `{"ok": true, "conviction_score": 62}` 說明 pipeline 正常。

### 5. 驗證數據文件

```
https://your-project.vercel.app/reports/conviction_2026-04-09.json
```

### Cron 時間

`vercel.json` 已設置每個工作日 06:00 UTC（美東 02:00）自動執行。
Vercel 免費版支持 Cron，但需要部署在 Hobby 或以上 plan。

## 本地開發

```bash
npm install
cp .env.example .env.local
# 填入真實 API key
npx vercel dev
# 然後訪問 http://localhost:3000/api/generate?secret=YOUR_CRON_SECRET
```
