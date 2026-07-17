-- CreateTable
CREATE TABLE "store_download_snapshots" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "downloadCount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_download_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_download_snapshots_platform_date_idx" ON "store_download_snapshots"("platform", "date");

-- CreateIndex
CREATE UNIQUE INDEX "store_download_snapshots_platform_date_source_key" ON "store_download_snapshots"("platform", "date", "source");
