-- Create Shield Database
CREATE DATABASE IF NOT EXISTS shield;
USE shield;

-- Create Users Table
CREATE TABLE IF NOT EXISTS users (
  `id` VARCHAR(36) PRIMARY KEY,
  `firstName` VARCHAR(100) NOT NULL,
  `lastName` VARCHAR(100) NOT NULL,
  `peNumber` VARCHAR(50) UNIQUE,
  `carNumber` VARCHAR(50),
  `badgeNumber` VARCHAR(50) UNIQUE,
  `assignedTo` VARCHAR(100),
  `district` VARCHAR(100),
  `rank` VARCHAR(100),
  `isActive` BOOLEAN DEFAULT 1,
  `employmentType` VARCHAR(100),
  `typeDetails` VARCHAR(255),
  `status` VARCHAR(100),
  `supervisor` VARCHAR(100),
  `specialtyCertifications` TEXT,
  `publicSafetyId` VARCHAR(50) UNIQUE,
  `race` VARCHAR(50),
  `sex` VARCHAR(10),
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_firstName` (`firstName`),
  INDEX `idx_lastName` (`lastName`),
  INDEX `idx_peNumber` (`peNumber`),
  INDEX `idx_badgeNumber` (`badgeNumber`),
  INDEX `idx_publicSafetyId` (`publicSafetyId`),
  INDEX `idx_rank` (`rank`),
  INDEX `idx_district` (`district`),
  INDEX `idx_isActive` (`isActive`),
  INDEX `idx_employmentType` (`employmentType`),
  FULLTEXT INDEX `ft_search` (`firstName`, `lastName`, `peNumber`, `badgeNumber`, `publicSafetyId`)
);

-- Sample Data (Optional)
INSERT INTO users (
  `id`, `firstName`, `lastName`, `peNumber`, `carNumber`, `badgeNumber`,
  `assignedTo`, `district`, `rank`, `isActive`, `employmentType`, `typeDetails`,
  `status`, `supervisor`, `specialtyCertifications`, `publicSafetyId`, `race`, `sex`
) VALUES
  (UUID(), 'John', 'Smith', 'PE001', 'CAR001', 'BADGE001', 'Precinct A', 'District 1', 'Officer', 1, 'Full-time', 'Patrol', 'Active', 'Captain Davis', 'CPR Certified', 'PSID001', 'Caucasian', 'M'),
  (UUID(), 'Sarah', 'Johnson', 'PE002', 'CAR002', 'BADGE002', 'Precinct B', 'District 2', 'Detective', 1, 'Full-time', 'Investigation', 'Active', 'Captain Rodriguez', 'Advanced Investigation', 'PSID002', 'African American', 'F'),
  (UUID(), 'Michael', 'Williams', 'PE003', 'CAR003', 'BADGE003', 'Precinct A', 'District 1', 'Officer', 1, 'Full-time', 'Patrol', 'Active', 'Captain Davis', 'K9 Handler', 'PSID003', 'Hispanic', 'M');
