ALTER TYPE "DeliveryActStatus" ADD VALUE IF NOT EXISTS 'AWAITING_ENGINEER';

ALTER TABLE "DeliveryAct"
ADD COLUMN "engineerId" INTEGER,
ADD COLUMN "engineerConfirmedAt" TIMESTAMP(3);

ALTER TABLE "DeliveryAct"
ADD CONSTRAINT "DeliveryAct_engineerId_fkey"
FOREIGN KEY ("engineerId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DeliveryAct_engineerId_status_idx"
ON "DeliveryAct"("engineerId", "status");

INSERT INTO "Position" ("name", "organizationId", "createdAt", "updatedAt")
SELECT 'TB va XK muhandisi', o."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" o
ON CONFLICT ("organizationId", "name") DO NOTHING;

INSERT INTO "DepartmentPosition" ("departmentId", "positionId", "createdAt")
SELECT d."id", p."id", CURRENT_TIMESTAMP
FROM "Department" d
JOIN "Position" p
  ON p."organizationId" = d."organizationId"
 AND p."name" = 'TB va XK muhandisi'
ON CONFLICT ("departmentId", "positionId") DO NOTHING;
