-- CreateTable
CREATE TABLE "StoredMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rowid" INTEGER NOT NULL,
    "guid" TEXT NOT NULL,
    "text" TEXT,
    "handleId" TEXT NOT NULL,
    "isFromMe" BOOLEAN NOT NULL,
    "date" DATETIME NOT NULL,
    "dateRead" DATETIME,
    "dateDelivered" DATETIME,
    "chatId" INTEGER,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StoredAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rowid" INTEGER NOT NULL,
    "guid" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT,
    "transferName" TEXT,
    "totalBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME,
    "localPath" TEXT,
    "messageId" TEXT NOT NULL,
    CONSTRAINT "StoredAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "StoredMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'messages_sync',
    "lastSyncedRowid" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredMessage_rowid_key" ON "StoredMessage"("rowid");

-- CreateIndex
CREATE UNIQUE INDEX "StoredMessage_guid_key" ON "StoredMessage"("guid");

-- CreateIndex
CREATE INDEX "StoredMessage_handleId_idx" ON "StoredMessage"("handleId");

-- CreateIndex
CREATE INDEX "StoredMessage_date_idx" ON "StoredMessage"("date");

-- CreateIndex
CREATE INDEX "StoredMessage_rowid_idx" ON "StoredMessage"("rowid");

-- CreateIndex
CREATE UNIQUE INDEX "StoredAttachment_guid_key" ON "StoredAttachment"("guid");
