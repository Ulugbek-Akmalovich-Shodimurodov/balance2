-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_assetTypeId_fkey";

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "model" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "assetTypeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
