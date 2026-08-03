CREATE TABLE "Position" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Position_departmentId_name_key" ON "Position"("departmentId", "name");

ALTER TABLE "Position" ADD CONSTRAINT "Position_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "positionId" INTEGER;

ALTER TABLE "User" ADD CONSTRAINT "User_positionId_fkey"
FOREIGN KEY ("positionId") REFERENCES "Position"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Position" ("name", "departmentId", "updatedAt")
SELECT title.name, department.id, CURRENT_TIMESTAMP
FROM "Department" AS department
CROSS JOIN (VALUES ('Direktor'), ('Bosh hisobchi'), ('Yetakchi mutaxassis')) AS title(name);
