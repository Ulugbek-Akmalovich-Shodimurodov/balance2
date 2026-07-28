# Oracle Always Free production deploy

## Arxitektura

- Frontend: Vercel
- Backend va ONLYOFFICE: Oracle Cloud `VM.Standard.A1.Flex`
- Reverse proxy va HTTPS: Caddy
- PostgreSQL: Neon
- Dalolatnoma fayllari: Oracle Docker named volume

## 1. Oracle VM

Tavsiya etilgan parametrlar:

- Ubuntu 24.04 ARM64
- 2 OCPU
- 12 GB RAM
- 80–100 GB boot volume
- Public IPv4

Oracle VCN ingress qoidalarida TCP `22`, `80`, `443` portlarini oching. `5000` va ONLYOFFICE ichki portini public internetga ochmang.

## 2. DNS

Quyidagi ikkita nomni VM public IPv4 manziliga yo‘naltiring:

- `api-loyiha.duckdns.org`
- `office-loyiha.duckdns.org`

DNS yangilanganini tekshirmasdan containerlarni production rejimida ishga tushirmang. Caddy public DNS orqali avtomatik TLS sertifikat oladi.

## 3. Server paketlari

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Guruh o‘zgarishi kuchga kirishi uchun SSH sessiyasidan chiqib, qayta kiring.

## 4. Repository

```bash
git clone https://github.com/Ulugbek-Akmalovich-Shodimurodov/balance2.git
cd balance2
cp production.env.example production.env
```

## 5. Secret yaratish

Ikkita alohida secret yarating:

```bash
openssl rand -base64 64
openssl rand -base64 64
```

Birinchisini `JWT_SECRET`, ikkinchisini `ONLYOFFICE_JWT_SECRET` sifatida `production.env` fayliga yozing. Secretlarni GitHub, chat yoki loglarga joylamang.

## 6. Production environment

`production.env` ichida quyidagilar real qiymat bilan to‘ldiriladi:

```env
API_DOMAIN=api-loyiha.duckdns.org
OFFICE_DOMAIN=office-loyiha.duckdns.org
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_EXPIRES_IN=1d
CLIENT_URL=https://frontend.vercel.app
ONLYOFFICE_PUBLIC_URL=https://office-loyiha.duckdns.org
ONLYOFFICE_JWT_SECRET=...
```

## 7. Build va ishga tushirish

```bash
docker compose --env-file production.env -f docker-compose.production.yml config
docker compose --env-file production.env -f docker-compose.production.yml build backend
docker compose --env-file production.env -f docker-compose.production.yml up -d
docker compose --env-file production.env -f docker-compose.production.yml ps
```

Backend container ishga tushayotganda `prisma migrate deploy` avtomatik bajariladi.

## 8. Healthcheck

```bash
curl -fsS "https://api-loyiha.duckdns.org/health"
curl -fsS "https://office-loyiha.duckdns.org/healthcheck"
```

Kutilgan javoblar:

- Backend: `{"ok":true}`
- ONLYOFFICE: `true`

## 9. Vercel frontend

Frontend Vercel project environment:

```env
VITE_API_URL=https://api-loyiha.duckdns.org/api
```

Frontend deploy bo‘lgach uning aniq URL qiymatini Oracle serveridagi `CLIENT_URL` ga yozing va backendni qayta yarating:

```bash
docker compose --env-file production.env -f docker-compose.production.yml up -d --force-recreate backend
```

## 10. Loglar

```bash
docker compose --env-file production.env -f docker-compose.production.yml logs --tail=200 backend
docker compose --env-file production.env -f docker-compose.production.yml logs --tail=200 onlyoffice-documentserver
docker compose --env-file production.env -f docker-compose.production.yml logs --tail=200 caddy
```

## 11. Yangilash

```bash
git pull --ff-only
docker compose --env-file production.env -f docker-compose.production.yml build backend
docker compose --env-file production.env -f docker-compose.production.yml up -d
```

## 12. Backup

Named volume nomlarini aniqlang:

```bash
docker volume ls
```

Muhim ma’lumotlar:

- `delivery_act_files`
- `onlyoffice_data`
- `onlyoffice_lib`
- `production.env`

Neon backup va restore sozlamalarini alohida yoqing. Imzolangan PDF va DOCX fayllari uchun kamida kunlik tashqi backup rejalashtiring.

## 13. Qabul testi

1. Admin login.
2. Xodimga ikki qurilma biriktirish.
3. Ko‘p qurilmali yangi dalolatnomani ochish.
4. ONLYOFFICE’da noyob matn bilan tahrirlash.
5. Imzolashga yuborish va `forcesave` tugashini kutish.
6. Xodim bilan ko‘rish va parol orqali imzolash.
7. Imzolangan yozuvda faqat PDF va yashil tasdiq belgisini tekshirish.
8. PDF ichidagi tahrirlangan matn, QR va elektron imzo vaqtini tekshirish.
9. QR’ni telefonda ochib barcha qurilmalar chiqishini tekshirish.
10. Containerlarni restart qilib hujjatlar saqlanib qolganini tekshirish.
