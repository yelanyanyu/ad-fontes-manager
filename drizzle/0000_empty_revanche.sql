CREATE TABLE `local_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_words` (
	`id` text PRIMARY KEY NOT NULL,
	`raw_yaml` text NOT NULL,
	`lemma_preview` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `words_v2` (
	`id` text PRIMARY KEY NOT NULL,
	`lemma` text NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`part_of_speech` text,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`revision_count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_lemma_lang_v2` ON `words_v2` (`lemma`,`language`);--> statement-breakpoint
CREATE INDEX `idx_words_v2_language` ON `words_v2` (`language`);--> statement-breakpoint
CREATE INDEX `idx_words_v2_lemma_lang` ON `words_v2` (`lemma`,`language`);--> statement-breakpoint
CREATE INDEX `idx_words_v2_created_at` ON `words_v2` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_words_v2_updated_at` ON `words_v2` (`updated_at`);