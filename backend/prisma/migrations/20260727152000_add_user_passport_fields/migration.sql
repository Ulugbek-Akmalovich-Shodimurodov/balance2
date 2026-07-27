ALTER TABLE "User"
ADD COLUMN "passportSeries" TEXT,
ADD COLUMN "pinfl" TEXT;

CREATE UNIQUE INDEX "User_passportSeries_key" ON "User"("passportSeries");
CREATE UNIQUE INDEX "User_pinfl_key" ON "User"("pinfl");
