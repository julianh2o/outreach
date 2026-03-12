-- CreateTable
CREATE TABLE "ClientSyncState" (
    "clientId" TEXT NOT NULL PRIMARY KEY,
    "clientName" TEXT,
    "lastSyncedRowid" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME,
    "lastSeenAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StoredMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rowid" INTEGER NOT NULL,
    "guid" TEXT NOT NULL,
    "sourceClientId" TEXT,
    "text" TEXT,
    "handleId" TEXT NOT NULL,
    "isFromMe" BOOLEAN NOT NULL,
    "date" DATETIME NOT NULL,
    "dateRead" DATETIME,
    "dateDelivered" DATETIME,
    "chatId" INTEGER,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StoredMessage_sourceClientId_fkey" FOREIGN KEY ("sourceClientId") REFERENCES "ClientSyncState" ("clientId") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StoredMessage" ("chatId", "createdAt", "date", "dateDelivered", "dateRead", "guid", "handleId", "hasAttachments", "id", "isFromMe", "rowid", "text") SELECT "chatId", "createdAt", "date", "dateDelivered", "dateRead", "guid", "handleId", "hasAttachments", "id", "isFromMe", "rowid", "text" FROM "StoredMessage";
DROP TABLE "StoredMessage";
ALTER TABLE "new_StoredMessage" RENAME TO "StoredMessage";
CREATE UNIQUE INDEX "StoredMessage_guid_key" ON "StoredMessage"("guid");
CREATE INDEX "StoredMessage_handleId_idx" ON "StoredMessage"("handleId");
CREATE INDEX "StoredMessage_date_idx" ON "StoredMessage"("date");
CREATE INDEX "StoredMessage_sourceClientId_idx" ON "StoredMessage"("sourceClientId");
CREATE UNIQUE INDEX "StoredMessage_sourceClientId_rowid_key" ON "StoredMessage"("sourceClientId", "rowid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
