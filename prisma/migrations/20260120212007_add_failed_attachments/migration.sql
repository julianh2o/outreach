-- CreateTable
CREATE TABLE "FailedAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attachmentGuid" TEXT NOT NULL,
    "messageGuid" TEXT NOT NULL,
    "handleId" TEXT NOT NULL,
    "filename" TEXT,
    "transferName" TEXT,
    "mimeType" TEXT,
    "totalBytes" INTEGER NOT NULL DEFAULT 0,
    "errorReason" TEXT NOT NULL,
    "errorDetails" TEXT,
    "messageDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "FailedAttachment_attachmentGuid_key" ON "FailedAttachment"("attachmentGuid");

-- CreateIndex
CREATE INDEX "FailedAttachment_handleId_idx" ON "FailedAttachment"("handleId");

-- CreateIndex
CREATE INDEX "FailedAttachment_messageDate_idx" ON "FailedAttachment"("messageDate");

-- CreateIndex
CREATE INDEX "FailedAttachment_errorReason_idx" ON "FailedAttachment"("errorReason");
