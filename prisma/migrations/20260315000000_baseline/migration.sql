-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('INDOOR', 'OUTDOOR', 'BOTH');

-- CreateEnum
CREATE TYPE "Application" AS ENUM ('COMMERCIAL', 'INDUSTRIAL', 'RETAIL', 'OFFICE', 'WAREHOUSE', 'HEALTHCARE', 'EDUCATION', 'HOSPITALITY', 'RESIDENTIAL', 'OUTDOOR_AREA', 'HAZARDOUS');

-- CreateEnum
CREATE TYPE "Voltage" AS ENUM ('V120', 'V277', 'V120_277', 'V347', 'V347_480', 'V120_347', 'UNIVERSAL');

-- CreateEnum
CREATE TYPE "DimmingType" AS ENUM ('V0_10', 'DALI', 'TRIAC', 'PHASE', 'LUTRON', 'ELV', 'NLIGHT');

-- CreateEnum
CREATE TYPE "MountingType" AS ENUM ('RECESSED', 'SURFACE', 'PENDANT', 'CHAIN', 'POLE', 'WALL', 'GROUND', 'TRACK', 'STEM', 'CABLE', 'GRID_TBAR');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('DIRECT_REPLACEMENT', 'FUNCTIONAL_EQUIVALENT', 'UPGRADE', 'SIMILAR', 'BUDGET_ALTERNATIVE');

-- CreateEnum
CREATE TYPE "CrossRefSource" AS ENUM ('RULE_BASED', 'AI_GENERATED', 'MANUAL');

-- CreateEnum
CREATE TYPE "SubmittalStatus" AS ENUM ('DRAFT', 'GENERATED', 'SUBMITTED', 'APPROVED', 'APPROVED_AS_NOTED', 'REVISE_RESUBMIT', 'REJECTED', 'FINAL', 'ISSUED_FOR_REVIEW', 'ISSUED_FOR_CONSTRUCTION', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CrawlStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL', 'INTERRUPTED');

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "sourceUrl" TEXT,
    "externalKey" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "catalogNumber" TEXT NOT NULL,
    "familyName" TEXT,
    "displayName" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "environment" "Environment",
    "application" "Application",
    "wattage" DOUBLE PRECISION,
    "wattageMin" DOUBLE PRECISION,
    "wattageMax" DOUBLE PRECISION,
    "voltage" "Voltage",
    "dimmable" BOOLEAN,
    "dimmingType" "DimmingType"[],
    "powerFactor" DOUBLE PRECISION,
    "lumens" INTEGER,
    "lumensMin" INTEGER,
    "lumensMax" INTEGER,
    "efficacy" DOUBLE PRECISION,
    "cri" INTEGER,
    "cctOptions" INTEGER[],
    "colorTemp" INTEGER,
    "beamAngle" DOUBLE PRECISION,
    "formFactor" TEXT,
    "dimensions" TEXT,
    "weight" DOUBLE PRECISION,
    "finish" TEXT,
    "ipRating" TEXT,
    "nemaRating" TEXT,
    "mountingType" "MountingType"[],
    "wetLocation" BOOLEAN,
    "dampLocation" BOOLEAN,
    "ulListed" BOOLEAN,
    "dlcListed" BOOLEAN,
    "dlcPremium" BOOLEAN,
    "energyStar" BOOLEAN,
    "title24" BOOLEAN,
    "emergencyBackup" BOOLEAN,
    "specSheetUrl" TEXT,
    "specSheetPath" TEXT,
    "specSheets" JSONB,
    "productPageUrl" TEXT,
    "fieldProvenance" JSONB,
    "overallConfidence" DOUBLE PRECISION,
    "crawlEvidence" JSONB,
    "configOptions" JSONB,
    "lastCrawled" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "search_vector" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossReference" (
    "id" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "targetProductId" TEXT NOT NULL,
    "matchType" "MatchType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "matchReason" TEXT,
    "hardRejectReason" TEXT,
    "comparisonSnapshot" JSONB,
    "source" "CrossRefSource" NOT NULL DEFAULT 'RULE_BASED',
    "isApproved" BOOLEAN,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submittal" (
    "id" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectNumber" TEXT,
    "projectAddress" TEXT,
    "clientName" TEXT,
    "contractorName" TEXT,
    "preparedBy" TEXT,
    "preparedFor" TEXT,
    "revisionNumber" INTEGER NOT NULL DEFAULT 0,
    "revision" TEXT,
    "status" "SubmittalStatus" NOT NULL DEFAULT 'DRAFT',
    "pdfPath" TEXT,
    "pdfUrl" TEXT,
    "generatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalItem" (
    "id" TEXT NOT NULL,
    "submittalId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fixtureType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "location" TEXT,
    "mountingHeight" DOUBLE PRECISION,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmittalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrawlLog" (
    "id" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "status" "CrawlStatus" NOT NULL DEFAULT 'RUNNING',
    "categories" TEXT[],
    "productsFound" INTEGER NOT NULL DEFAULT 0,
    "productsNew" INTEGER NOT NULL DEFAULT 0,
    "productsUpdated" INTEGER NOT NULL DEFAULT 0,
    "productsCached" INTEGER NOT NULL DEFAULT 0,
    "parseFailures" INTEGER NOT NULL DEFAULT 0,
    "avgConfidence" DOUBLE PRECISION,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CrawlLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_name_key" ON "Manufacturer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_slug_key" ON "Manufacturer"("slug");

-- CreateIndex
CREATE INDEX "Category_manufacturerId_idx" ON "Category"("manufacturerId");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Category_manufacturerId_parentId_sortOrder_idx" ON "Category"("manufacturerId", "parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Category_manufacturerId_parentId_slug_key" ON "Category"("manufacturerId", "parentId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_manufacturerId_path_key" ON "Category"("manufacturerId", "path");

-- CreateIndex
CREATE INDEX "Product_manufacturerId_idx" ON "Product"("manufacturerId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Product_isActive_categoryId_manufacturerId_idx" ON "Product"("isActive", "categoryId", "manufacturerId");

-- CreateIndex
CREATE INDEX "Product_dlcListed_idx" ON "Product"("dlcListed");

-- CreateIndex
CREATE INDEX "Product_lastCrawled_idx" ON "Product"("lastCrawled");

-- CreateIndex
CREATE UNIQUE INDEX "Product_manufacturerId_catalogNumber_key" ON "Product"("manufacturerId", "catalogNumber");

-- CreateIndex
CREATE INDEX "CrossReference_sourceProductId_idx" ON "CrossReference"("sourceProductId");

-- CreateIndex
CREATE INDEX "CrossReference_targetProductId_idx" ON "CrossReference"("targetProductId");

-- CreateIndex
CREATE UNIQUE INDEX "CrossReference_sourceProductId_targetProductId_key" ON "CrossReference"("sourceProductId", "targetProductId");

-- CreateIndex
CREATE INDEX "Submittal_status_idx" ON "Submittal"("status");

-- CreateIndex
CREATE INDEX "Submittal_createdAt_idx" ON "Submittal"("createdAt");

-- CreateIndex
CREATE INDEX "SubmittalItem_submittalId_idx" ON "SubmittalItem"("submittalId");

-- CreateIndex
CREATE INDEX "CrawlLog_manufacturerId_idx" ON "CrawlLog"("manufacturerId");

-- CreateIndex
CREATE INDEX "CrawlLog_startedAt_idx" ON "CrawlLog"("startedAt");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossReference" ADD CONSTRAINT "CrossReference_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossReference" ADD CONSTRAINT "CrossReference_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalItem" ADD CONSTRAINT "SubmittalItem_submittalId_fkey" FOREIGN KEY ("submittalId") REFERENCES "Submittal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalItem" ADD CONSTRAINT "SubmittalItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlLog" ADD CONSTRAINT "CrawlLog_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
