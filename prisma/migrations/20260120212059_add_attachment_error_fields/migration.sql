/*
  Warnings:

  - You are about to drop the `FailedAttachment` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "StoredAttachment" ADD COLUMN "errorDetails" TEXT;
ALTER TABLE "StoredAttachment" ADD COLUMN "errorReason" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "FailedAttachment";
PRAGMA foreign_keys=on;

-- CreateIndex
CREATE INDEX "StoredAttachment_errorReason_idx" ON "StoredAttachment"("errorReason");
