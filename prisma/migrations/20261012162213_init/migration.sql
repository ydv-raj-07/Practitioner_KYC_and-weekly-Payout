-- CreateEnum
CREATE TYPE "PractitionerStatus" AS ENUM ('submitted', 'under_review', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "Practitioner" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "nameEnc" TEXT NOT NULL,
    "panEnc" TEXT NOT NULL,
    "phoneEnc" TEXT NOT NULL,
    "panHash" TEXT NOT NULL,
    "skills" TEXT[],
    "status" "PractitionerStatus" NOT NULL DEFAULT 'submitted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Practitioner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "practitionerId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Earning" (
    "id" UUID NOT NULL,
    "practitionerId" UUID NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,

    CONSTRAINT "Earning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" UUID NOT NULL,
    "practitionerId" UUID NOT NULL,
    "weekLabel" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "platformSharePaise" INTEGER NOT NULL,
    "tdsPaise" INTEGER NOT NULL,
    "netPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Practitioner_panHash_key" ON "Practitioner"("panHash");

-- CreateIndex
CREATE INDEX "Document_practitionerId_idx" ON "Document"("practitionerId");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "Earning_practitionerId_earnedAt_idx" ON "Earning"("practitionerId", "earnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_practitionerId_weekStart_key" ON "Payout"("practitionerId", "weekStart");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Earning" ADD CONSTRAINT "Earning_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES "Practitioner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
