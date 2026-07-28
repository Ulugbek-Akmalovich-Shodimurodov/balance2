CREATE TYPE "DeliveryActStatus" AS ENUM ('DRAFT', 'PENDING', 'SIGNED', 'CANCELLED');

CREATE TABLE "DeliveryAct" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "transactionId" INTEGER,
    "assetId" INTEGER NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "status" "DeliveryActStatus" NOT NULL DEFAULT 'DRAFT',
    "condition" TEXT NOT NULL DEFAULT 'Yaxshi',
    "equipment" TEXT,
    "note" TEXT,
    "snapshot" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeliveryAct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryAct_number_key" ON "DeliveryAct"("number");
CREATE UNIQUE INDEX "DeliveryAct_transactionId_key" ON "DeliveryAct"("transactionId");
CREATE INDEX "DeliveryAct_recipientId_assetId_idx" ON "DeliveryAct"("recipientId", "assetId");

ALTER TABLE "DeliveryAct" ADD CONSTRAINT "DeliveryAct_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryAct" ADD CONSTRAINT "DeliveryAct_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryAct" ADD CONSTRAINT "DeliveryAct_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryAct" ADD CONSTRAINT "DeliveryAct_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
