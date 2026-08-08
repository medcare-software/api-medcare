-- CreateTable
CREATE TABLE "app_force_update_configs" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "latestStoreVersion" TEXT NOT NULL DEFAULT '',
    "forceUpdateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "storeUrl" TEXT NOT NULL,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_force_update_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_force_update_configs_platform_key" ON "app_force_update_configs"("platform");
