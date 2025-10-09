-- CreateTable
CREATE TABLE "Article" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "currentRanking" INTEGER,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "ctr" REAL,
    "publishedAt" DATETIME NOT NULL,
    "lastUpdatedAt" DATETIME,
    "lastRewrittenAt" DATETIME,
    "rewriteCount" INTEGER NOT NULL DEFAULT 0,
    "cvCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CompanyInfo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "tags" TEXT NOT NULL,
    "embeddings" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RewriteHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "articleId" INTEGER NOT NULL,
    "beforeTitle" TEXT NOT NULL,
    "afterTitle" TEXT NOT NULL,
    "beforeContent" TEXT NOT NULL,
    "afterContent" TEXT NOT NULL,
    "addedFaq" TEXT,
    "internalLinks" TEXT NOT NULL,
    "qualityScore" INTEGER,
    "rewrittenBy" TEXT NOT NULL,
    "rewrittenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewriteHistory_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FaqTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "keyword" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RewriteTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "articleId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "scheduledAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_url_key" ON "Article"("url");

-- CreateIndex
CREATE INDEX "Article_currentRanking_idx" ON "Article"("currentRanking");

-- CreateIndex
CREATE INDEX "Article_lastRewrittenAt_idx" ON "Article"("lastRewrittenAt");

-- CreateIndex
CREATE INDEX "CompanyInfo_category_idx" ON "CompanyInfo"("category");

-- CreateIndex
CREATE INDEX "CompanyInfo_isPublic_idx" ON "CompanyInfo"("isPublic");

-- CreateIndex
CREATE INDEX "RewriteHistory_articleId_idx" ON "RewriteHistory"("articleId");

-- CreateIndex
CREATE INDEX "FaqTemplate_keyword_idx" ON "FaqTemplate"("keyword");

-- CreateIndex
CREATE INDEX "RewriteTask_status_idx" ON "RewriteTask"("status");

-- CreateIndex
CREATE INDEX "RewriteTask_scheduledAt_idx" ON "RewriteTask"("scheduledAt");
