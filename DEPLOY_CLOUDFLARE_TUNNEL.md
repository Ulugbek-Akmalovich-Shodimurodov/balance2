# Shaxsiy kompyuter + Cloudflare Tunnel

## Production manzillari

- Frontend: Vercel
- Backend: `https://api.ulugbekakmalovich.uz`
- ONLYOFFICE: `https://office.ulugbekakmalovich.uz`
- Backend va hujjatlar: shaxsiy kompyuterdagi Docker named volume

Routerda port ochish, statik IP va lokal TLS sertifikat talab qilinmaydi.

## 1. Domenni Cloudflare'ga ulash

Cloudflare panelida `ulugbekakmalovich.uz` saytini qo‘shing. Registrar panelida
Cloudflare bergan ikkita nameserverni o‘rnating. Cloudflare domen holati
`Active` bo‘lmaguncha keyingi production bosqichiga o‘tmang.

## 2. Doimiy tunnel yaratish

Cloudflare panelida:

1. `Zero Trust` > `Networks` > `Tunnels` bo‘limiga kiring.
2. `Create a tunnel` > `Cloudflared` ni tanlang.
3. Tunnel nomini `balance-production` deb kiriting.
4. Docker connector turini tanlab, ko‘rsatilgan tokenni nusxalang.
5. Tokenni faqat lokal `production.env` ichidagi
   `CLOUDFLARE_TUNNEL_TOKEN` qiymatiga yozing. Uni GitHub yoki chatga
   yubormang.

## 3. Public hostnamelar

Tunnelning `Public Hostnames` bo‘limida ikki yo‘nalish yarating:

| Public hostname | Service |
| --- | --- |
| `api.ulugbekakmalovich.uz` | `http://backend:5000` |
| `office.ulugbekakmalovich.uz` | `http://onlyoffice-documentserver:80` |

Ikkala yo‘nalishda ham Cloudflare avtomatik HTTPS taqdim etadi.

## 4. Environment

```powershell
Copy-Item production.env.example production.env
```

`production.env` ichida quyidagi qiymatlarni haqiqiy qiymatlar bilan
to‘ldiring:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_EXPIRES_IN=1d
CLIENT_URL=https://frontend.vercel.app
ONLYOFFICE_PUBLIC_URL=https://office.ulugbekakmalovich.uz
ONLYOFFICE_JWT_SECRET=...
CLOUDFLARE_TUNNEL_TOKEN=...
```

`JWT_SECRET` va `ONLYOFFICE_JWT_SECRET` bir-biridan farqli, uzun tasodifiy
qiymatlar bo‘lishi kerak.

## 5. Tekshirish va ishga tushirish

```powershell
docker compose --env-file production.env -f docker-compose.cloudflare.yml config
docker compose --env-file production.env -f docker-compose.cloudflare.yml build backend
docker compose --env-file production.env -f docker-compose.cloudflare.yml up -d
docker compose --env-file production.env -f docker-compose.cloudflare.yml ps
```

## 6. Healthcheck

```powershell
Invoke-RestMethod https://api.ulugbekakmalovich.uz/health
Invoke-RestMethod https://office.ulugbekakmalovich.uz/healthcheck
```

Kutilgan natijalar:

- backend: `ok = True`
- ONLYOFFICE: `true`

## 7. Vercel

Frontend Vercel project environment qiymati:

```env
VITE_API_URL=https://api.ulugbekakmalovich.uz/api
```

Vercel production URL aniq bo‘lgach, uni `production.env` faylidagi
`CLIENT_URL` ga yozing va backendni qayta yarating:

```powershell
docker compose --env-file production.env -f docker-compose.cloudflare.yml up -d --force-recreate backend
```

## 8. Kundalik ishlash

Kompyuter qayta yoqilganda Docker Desktop avtomatik ishga tushishi kerak.
Konteynerlarda `restart: unless-stopped` yoqilgan, shuning uchun Docker
ishga tushgach ular ham qayta ishga tushadi.

Holat va loglar:

```powershell
docker compose --env-file production.env -f docker-compose.cloudflare.yml ps
docker compose --env-file production.env -f docker-compose.cloudflare.yml logs --tail=200 backend
docker compose --env-file production.env -f docker-compose.cloudflare.yml logs --tail=200 onlyoffice-documentserver
docker compose --env-file production.env -f docker-compose.cloudflare.yml logs --tail=200 cloudflared
```

## 9. Muhim cheklovlar

- Kompyuter, Docker Desktop va internet doimo ishlashi kerak.
- Windows uyqu rejimiga o‘tmasligi kerak.
- `production.env`, dalolatnoma fayllari va ma’lumotlar bazasi muntazam
  zaxiralanishi kerak.
- Imzolangan hujjatlar mavjudligi sababli noma’lum tunnellar va tasodifiy
  `trycloudflare.com` manzillaridan production uchun foydalanmang.
