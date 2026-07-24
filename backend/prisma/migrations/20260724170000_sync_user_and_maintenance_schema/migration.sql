-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'REPAIRED', 'REPLACED', 'WAREHOUSED');

-- AlterTable
ALTER TABLE "MaintenanceLog" ADD COLUMN "reportedDepartmentId" INTEGER,
ADD COLUMN "reportedUserId" INTEGER,
ADD COLUMN "resolutionNote" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "status" "MaintenanceStatus" NOT NULL DEFAULT 'NEW';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "departmentId" INTEGER,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "login" TEXT,
ADD COLUMN "phone" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
