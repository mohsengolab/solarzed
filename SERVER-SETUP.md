# راه‌اندازی سرور Windows  —  51.68.57.167

## یک‌بار روی سرور (نصب اولیه)

### 1. نصب Node.js
از https://nodejs.org دانلود و نصب کنید (نسخه LTS).

### 2. نصب .NET 10
```powershell
winget install Microsoft.DotNet.SDK.10
```
یا از https://dotnet.microsoft.com/download دانلود کنید.

### 3. نصب Git
```powershell
winget install Git.Git
```

### 4. نصب PM2
```powershell
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
```
این کار باعث می‌شود PM2 بعد از reboot سرور هم auto-start کند.

### 5. کلون پروژه
```powershell
git clone <REPO_URL> C:\Apps\sunvision
```

### 6. اجرای اولین deploy
```powershell
powershell -ExecutionPolicy Bypass -File C:\Apps\sunvision\deploy-server.ps1
```

---

## هر بار deploy

```powershell
powershell -ExecutionPolicy Bypass -File C:\Apps\sunvision\deploy-server.ps1
```

با رمز از قبل (بدون prompt):
```powershell
$env:SOLARZED_SQL_PASSWORD = "your-password"
powershell -ExecutionPolicy Bypass -File C:\Apps\sunvision\deploy-server.ps1
```

---

## Zero-Downtime چطور کار می‌کند؟

`pm2 reload` با `pm2 restart` فرق دارد:
- **restart**: سرویس می‌میرد، بعد زنده می‌شود (downtime دارد)
- **reload**: instance جدید زنده می‌شود، بعد قدیمی می‌میرد (zero-downtime)

---

## پورت‌ها

| سرویس      | پورت |
|------------|------|
| Node.js web | 4173 |
| Next.js     | 3000 |
| .NET API    | 5000 |

---

## مشاهده لاگ

```powershell
pm2 logs solarzed-web
pm2 logs solarzed-api
pm2 logs solarzed-next
pm2 monit
```

## مشکل‌یابی

```powershell
pm2 list              # وضعیت همه سرویس‌ها
pm2 info solarzed-web # جزئیات یک سرویس
pm2 flush             # پاک کردن لاگ‌ها
```
