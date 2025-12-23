-- AlterTable
ALTER TABLE `peserta_ujians` ADD COLUMN `is_blocked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `block_reason` TEXT NULL,
    ADD COLUMN `unlock_code` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `peserta_ujians_unlock_code_key` ON `peserta_ujians`(`unlock_code`);
