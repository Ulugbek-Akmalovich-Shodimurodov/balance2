# Asset Management System

Katta tashkilotlar uchun o‘zbek tilidagi web-based Asset Management System.

## Texnologiyalar
- Frontend: React, Ant Design, Redux Toolkit, Recharts
- Backend: Node.js, Express.js, Prisma ORM
- Database: PostgreSQL
- Auth: JWT, role-based access control
- Security: Helmet, CORS, rate limit
- Logging: Winston
- Validation: Zod
- Export: Excel/PDF
- QR: QR code generation

## Lokal ishga tushirish

```bash
npm run install:all
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cd backend && npx prisma migrate dev --name init && npm run seed
cd ../..
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:5000

Demo login:
- admin@example.com / Admin123!

## Docker

```bash
docker compose up --build
```

## API endpointlar

Auth:
- POST `/api/auth/login`
- POST `/api/auth/logout`
- GET `/api/auth/me`

Assets:
- GET `/api/assets?search=&status=&departmentId=&page=&limit=`
- POST `/api/assets`
- GET `/api/assets/:id`
- PUT `/api/assets/:id`
- DELETE `/api/assets/:id`
- GET `/api/assets/:id/qr`

Users:
- GET/POST `/api/users`
- GET/PUT/DELETE `/api/users/:id`

Departments:
- GET/POST `/api/departments`
- GET/PUT/DELETE `/api/departments/:id`

Transactions:
- POST `/api/transactions/assign`
- POST `/api/transactions/return`
- GET `/api/transactions/asset/:assetId`

Maintenance:
- GET/POST `/api/maintenance`
- GET/PUT/DELETE `/api/maintenance/:id`

Dashboard/Reports/Audit:
- GET `/api/dashboard/stats`
- GET `/api/reports/assets.xlsx`
- GET `/api/reports/assets.pdf`
- GET `/api/audit-logs`
