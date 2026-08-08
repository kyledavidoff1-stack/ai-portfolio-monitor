ALTER TABLE `analysis_scans` ADD `driver_analysis` text;--> statement-breakpoint
ALTER TABLE `analysis_scans` ADD `step_timestamps` text;--> statement-breakpoint
ALTER TABLE `holdings` ADD `beta` real;--> statement-breakpoint
CREATE UNIQUE INDEX `fundamentals_ticker_unique` ON `fundamentals` (`ticker`);--> statement-breakpoint
CREATE UNIQUE INDEX `price_history_ticker_date_idx` ON `price_history` (`ticker`,`date`);