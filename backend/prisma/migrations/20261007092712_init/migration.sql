-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN');

-- CreateEnum
CREATE TYPE "CameraStatus" AS ENUM ('ONLINE', 'CONNECTING', 'OFFLINE', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "ZoneType" AS ENUM ('LINE', 'AREA');

-- CreateEnum
CREATE TYPE "DetectionClass" AS ENUM ('PERSON', 'DOG', 'CAT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('DAILY', 'WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ModelTask" AS ENUM ('DETECTOR', 'FACE', 'GENDER');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "rtspUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "analyticsFps" INTEGER NOT NULL DEFAULT 10,
    "detectPersons" BOOLEAN NOT NULL DEFAULT true,
    "detectGender" BOOLEAN NOT NULL DEFAULT true,
    "detectPets" BOOLEAN NOT NULL DEFAULT true,
    "status" "CameraStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMP(3),
    "lastError" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "cameraId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ZoneType" NOT NULL,
    "points" JSONB NOT NULL,
    "inDirection" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" BIGSERIAL NOT NULL,
    "cameraId" TEXT NOT NULL,
    "trackKey" TEXT NOT NULL,
    "class" "DetectionClass" NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "genderConfidence" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "dwellSeconds" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountEvent" (
    "id" BIGSERIAL NOT NULL,
    "cameraId" TEXT NOT NULL,
    "zoneId" TEXT,
    "class" "DetectionClass" NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "direction" "Direction" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinuteAggregate" (
    "id" BIGSERIAL NOT NULL,
    "cameraId" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "class" "DetectionClass" NOT NULL,
    "gender" "Gender" NOT NULL DEFAULT 'UNKNOWN',
    "uniqueCount" INTEGER NOT NULL DEFAULT 0,
    "inCount" INTEGER NOT NULL DEFAULT 0,
    "outCount" INTEGER NOT NULL DEFAULT 0,
    "maxOccupancy" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MinuteAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "pdfPath" TEXT,
    "xlsxPath" TEXT,
    "summary" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelVersion" (
    "id" TEXT NOT NULL,
    "task" "ModelTask" NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "metrics" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_adminId_idx" ON "RefreshToken"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "Camera_code_key" ON "Camera"("code");

-- CreateIndex
CREATE INDEX "Zone_cameraId_idx" ON "Zone"("cameraId");

-- CreateIndex
CREATE INDEX "Track_firstSeenAt_idx" ON "Track"("firstSeenAt");

-- CreateIndex
CREATE INDEX "Track_cameraId_firstSeenAt_idx" ON "Track"("cameraId", "firstSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Track_cameraId_trackKey_key" ON "Track"("cameraId", "trackKey");

-- CreateIndex
CREATE INDEX "CountEvent_occurredAt_idx" ON "CountEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "CountEvent_cameraId_occurredAt_idx" ON "CountEvent"("cameraId", "occurredAt");

-- CreateIndex
CREATE INDEX "MinuteAggregate_bucket_idx" ON "MinuteAggregate"("bucket");

-- CreateIndex
CREATE UNIQUE INDEX "MinuteAggregate_cameraId_bucket_class_gender_key" ON "MinuteAggregate"("cameraId", "bucket", "class", "gender");

-- CreateIndex
CREATE INDEX "Report_type_periodStart_idx" ON "Report"("type", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ModelVersion_task_version_key" ON "ModelVersion"("task", "version");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountEvent" ADD CONSTRAINT "CountEvent_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountEvent" ADD CONSTRAINT "CountEvent_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteAggregate" ADD CONSTRAINT "MinuteAggregate_cameraId_fkey" FOREIGN KEY ("cameraId") REFERENCES "Camera"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
