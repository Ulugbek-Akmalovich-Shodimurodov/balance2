ALTER TABLE "Asset" ADD COLUMN "manufactureYear" INTEGER;

ALTER TABLE "Asset"
ADD CONSTRAINT "Asset_manufactureYear_check"
CHECK ("manufactureYear" IS NULL OR ("manufactureYear" BETWEEN 1900 AND 2100));
