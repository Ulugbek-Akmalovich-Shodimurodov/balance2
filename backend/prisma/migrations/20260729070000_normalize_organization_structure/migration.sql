CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

INSERT INTO "Organization" ("name", "updatedAt")
VALUES ('Tashkilot', CURRENT_TIMESTAMP);

ALTER TABLE "Department" ADD COLUMN "organizationId" INTEGER;
UPDATE "Department" SET "organizationId" = (SELECT "id" FROM "Organization" WHERE "name" = 'Tashkilot');
ALTER TABLE "Department" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Department" ADD CONSTRAINT "Department_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Position" ADD COLUMN "organizationId" INTEGER;
UPDATE "Position" AS position
SET "organizationId" = department."organizationId"
FROM "Department" AS department
WHERE department."id" = position."departmentId";
ALTER TABLE "Position" ALTER COLUMN "organizationId" SET NOT NULL;

CREATE TABLE "DepartmentPosition" (
    "id" SERIAL NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "positionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DepartmentPosition_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DepartmentPosition" ("departmentId", "positionId")
SELECT "departmentId", "id" FROM "Position";

ALTER TABLE "User" ADD COLUMN "departmentPositionId" INTEGER;
UPDATE "User" AS employee
SET "departmentPositionId" = assignment."id"
FROM "DepartmentPosition" AS assignment
WHERE employee."positionId" = assignment."positionId";

UPDATE "DepartmentPosition" AS assignment
SET "positionId" = canonical."canonicalId"
FROM (
    SELECT duplicate."id" AS "duplicateId", MIN(original."id") AS "canonicalId"
    FROM "Position" AS duplicate
    JOIN "Position" AS original
      ON original."organizationId" = duplicate."organizationId"
     AND original."name" = duplicate."name"
    GROUP BY duplicate."id"
) AS canonical
WHERE assignment."positionId" = canonical."duplicateId";

ALTER TABLE "User" DROP CONSTRAINT "User_positionId_fkey";
ALTER TABLE "User" DROP COLUMN "positionId";
ALTER TABLE "Position" DROP CONSTRAINT "Position_departmentId_fkey";
DROP INDEX "Position_departmentId_name_key";
DELETE FROM "Position" AS duplicate
WHERE duplicate."id" <> (
    SELECT MIN(original."id")
    FROM "Position" AS original
    WHERE original."organizationId" = duplicate."organizationId"
      AND original."name" = duplicate."name"
);
ALTER TABLE "Position" DROP COLUMN "departmentId";

CREATE UNIQUE INDEX "Position_organizationId_name_key" ON "Position"("organizationId", "name");
CREATE UNIQUE INDEX "DepartmentPosition_departmentId_positionId_key"
ON "DepartmentPosition"("departmentId", "positionId");

ALTER TABLE "Position" ADD CONSTRAINT "Position_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DepartmentPosition" ADD CONSTRAINT "DepartmentPosition_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DepartmentPosition" ADD CONSTRAINT "DepartmentPosition_positionId_fkey"
FOREIGN KEY ("positionId") REFERENCES "Position"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_departmentPositionId_fkey"
FOREIGN KEY ("departmentPositionId") REFERENCES "DepartmentPosition"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
