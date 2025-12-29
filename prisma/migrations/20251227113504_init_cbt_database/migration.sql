-- CreateTable
CREATE TABLE `activity_logs` (
    `log_id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NULL,
    `peserta_ujian_id` INTEGER NULL,
    `activity_type` VARCHAR(100) NOT NULL,
    `description` TEXT NOT NULL,
    `ip_address` VARCHAR(50) NULL,
    `user_agent` TEXT NULL,
    `metadata` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_activity_type`(`activity_type`),
    INDEX `idx_created_at`(`created_at`),
    INDEX `idx_peserta_ujian_id`(`peserta_ujian_id`),
    INDEX `idx_user_id`(`user_id`),
    PRIMARY KEY (`log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hasil_ujians` (
    `hasil_ujian_id` INTEGER NOT NULL AUTO_INCREMENT,
    `nilai_akhir` DOUBLE NOT NULL,
    `tanggal_submit` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `peserta_ujian_id` INTEGER NOT NULL,

    UNIQUE INDEX `hasil_ujians_peserta_ujian_id_key`(`peserta_ujian_id`),
    PRIMARY KEY (`hasil_ujian_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `jawabans` (
    `jawaban_id` INTEGER NOT NULL AUTO_INCREMENT,
    `jawaban_essay_text` TEXT NULL,
    `jawaban_pg_opsi_ids` TEXT NULL,
    `is_correct` BOOLEAN NULL,
    `nilai_manual` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `peserta_ujian_id` INTEGER NOT NULL,
    `soal_id` INTEGER NOT NULL,

    INDEX `jawabans_peserta_ujian_id_fkey`(`peserta_ujian_id`),
    INDEX `jawabans_soal_id_fkey`(`soal_id`),
    PRIMARY KEY (`jawaban_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `migrations` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `migration` VARCHAR(255) NOT NULL,
    `batch` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `opsi_jawabans` (
    `opsi_id` INTEGER NOT NULL AUTO_INCREMENT,
    `label` VARCHAR(191) NOT NULL,
    `teks_opsi` TEXT NOT NULL,
    `is_benar` BOOLEAN NOT NULL DEFAULT false,
    `soal_id` INTEGER NOT NULL,

    INDEX `opsi_jawabans_soal_id_fkey`(`soal_id`),
    PRIMARY KEY (`opsi_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `peserta_ujians` (
    `peserta_ujian_id` INTEGER NOT NULL AUTO_INCREMENT,
    `status_ujian` ENUM('BELUM_MULAI', 'SEDANG_DIKERJAKAN', 'SELESAI', 'DINILAI') NOT NULL DEFAULT 'BELUM_MULAI',
    `waktu_mulai` DATETIME(3) NULL,
    `waktu_selesai` DATETIME(3) NULL,
    `ujian_id` INTEGER NOT NULL,
    `siswa_id` INTEGER NOT NULL,
    `is_blocked` BOOLEAN NOT NULL DEFAULT false,
    `block_reason` TEXT NULL,
    `unlock_code` VARCHAR(191) NULL,

    UNIQUE INDEX `peserta_ujians_unlock_code_key`(`unlock_code`),
    INDEX `peserta_ujians_siswa_id_fkey`(`siswa_id`),
    INDEX `peserta_ujians_ujian_id_fkey`(`ujian_id`),
    PRIMARY KEY (`peserta_ujian_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `soal_ujians` (
    `soal_ujian_id` INTEGER NOT NULL AUTO_INCREMENT,
    `bobot_nilai` INTEGER NOT NULL,
    `urutan` INTEGER NOT NULL,
    `ujian_id` INTEGER NOT NULL,
    `soal_id` INTEGER NOT NULL,

    INDEX `soal_ujians_soal_id_fkey`(`soal_id`),
    INDEX `soal_ujians_ujian_id_fkey`(`ujian_id`),
    PRIMARY KEY (`soal_ujian_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `soals` (
    `soal_id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipe_soal` ENUM('PILIHAN_GANDA_SINGLE', 'PILIHAN_GANDA_MULTIPLE', 'ESSAY') NOT NULL,
    `teks_soal` TEXT NOT NULL,
    `mata_pelajaran` VARCHAR(191) NOT NULL,
    `tingkat` VARCHAR(191) NOT NULL,
    `jurusan` VARCHAR(191) NULL,
    `soal_gambar` VARCHAR(191) NULL,
    `soal_pembahasan` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `guru_id` INTEGER NOT NULL,

    INDEX `soals_guru_id_fkey`(`guru_id`),
    PRIMARY KEY (`soal_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ujians` (
    `ujian_id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama_ujian` VARCHAR(191) NOT NULL,
    `mata_pelajaran` VARCHAR(191) NOT NULL,
    `tingkat` VARCHAR(191) NOT NULL,
    `jurusan` VARCHAR(191) NULL,
    `tanggal_mulai` DATETIME(3) NOT NULL,
    `tanggal_selesai` DATETIME(3) NOT NULL,
    `durasi_menit` INTEGER NOT NULL,
    `is_acak_soal` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `guru_id` INTEGER NOT NULL,

    INDEX `ujians_guru_id_fkey`(`guru_id`),
    PRIMARY KEY (`ujian_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `hasil_ujians` ADD CONSTRAINT `hasil_ujians_peserta_ujian_id_fkey` FOREIGN KEY (`peserta_ujian_id`) REFERENCES `peserta_ujians`(`peserta_ujian_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jawabans` ADD CONSTRAINT `jawabans_peserta_ujian_id_fkey` FOREIGN KEY (`peserta_ujian_id`) REFERENCES `peserta_ujians`(`peserta_ujian_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jawabans` ADD CONSTRAINT `jawabans_soal_id_fkey` FOREIGN KEY (`soal_id`) REFERENCES `soals`(`soal_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `opsi_jawabans` ADD CONSTRAINT `opsi_jawabans_soal_id_fkey` FOREIGN KEY (`soal_id`) REFERENCES `soals`(`soal_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `peserta_ujians` ADD CONSTRAINT `peserta_ujians_siswa_id_fkey` FOREIGN KEY (`siswa_id`) REFERENCES `siswas`(`siswa_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `peserta_ujians` ADD CONSTRAINT `peserta_ujians_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujians`(`ujian_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soal_ujians` ADD CONSTRAINT `soal_ujians_soal_id_fkey` FOREIGN KEY (`soal_id`) REFERENCES `soals`(`soal_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soal_ujians` ADD CONSTRAINT `soal_ujians_ujian_id_fkey` FOREIGN KEY (`ujian_id`) REFERENCES `ujians`(`ujian_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soals` ADD CONSTRAINT `soals_guru_id_fkey` FOREIGN KEY (`guru_id`) REFERENCES `gurus`(`guru_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ujians` ADD CONSTRAINT `ujians_guru_id_fkey` FOREIGN KEY (`guru_id`) REFERENCES `gurus`(`guru_id`) ON DELETE CASCADE ON UPDATE CASCADE;
