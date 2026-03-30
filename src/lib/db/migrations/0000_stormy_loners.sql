CREATE TABLE `analysis_scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`scan_type` text NOT NULL,
	`bucket_primary` integer,
	`bucket_secondary` integer,
	`bucket_rationale` text,
	`bucket_confidence` text,
	`news_sentiment` text,
	`thesis_status` text,
	`thesis_analysis` text,
	`catalysts` text,
	`five_metrics` text,
	`sector_relative` text,
	`full_analysis` text,
	`scanned_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `anomaly_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`flag_type` text NOT NULL,
	`description` text NOT NULL,
	`severity` text NOT NULL,
	`resolved` integer DEFAULT 0,
	`flagged_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fundamentals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`data` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`company_name` text,
	`shares` real,
	`cost_basis` real,
	`sector` text,
	`industry` text,
	`sector_etf` text,
	`thesis` text,
	`added_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `price_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`date` text NOT NULL,
	`close` real NOT NULL,
	`volume` integer
);
--> statement-breakpoint
CREATE TABLE `regime_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`regime` text NOT NULL,
	`rationale` text NOT NULL,
	`spy_change` real,
	`vix` real,
	`snapped_at` text NOT NULL
);
