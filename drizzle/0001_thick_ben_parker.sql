CREATE TABLE `candidate_courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`required` integer DEFAULT 0 NOT NULL,
	`added_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_courses_course_unique` ON `candidate_courses` (`course_id`);--> statement-breakpoint
CREATE TABLE `confirmed_enrollments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`tutorial_session_id` integer NOT NULL,
	`confirmed_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tutorial_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `confirmed_enrollments_course_unique` ON `confirmed_enrollments` (`course_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_code_unique` ON `courses` (`code`);--> statement-breakpoint
CREATE TABLE `plan_preferences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`desired_course_count` integer DEFAULT 3 NOT NULL,
	`blackout_days` text DEFAULT '[]' NOT NULL,
	`soft_preferences` text DEFAULT '{"minimizeDaysOnCampus":false,"avoidDays":[]}' NOT NULL,
	CONSTRAINT "plan_preferences_count_check" CHECK("plan_preferences"."desired_course_count" in (3, 4))
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`day_of_week` integer NOT NULL,
	`start_minutes` integer NOT NULL,
	`end_minutes` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sessions_kind_check" CHECK("sessions"."kind" in ('lecture', 'tutorial')),
	CONSTRAINT "sessions_day_check" CHECK("sessions"."day_of_week" between 0 and 6),
	CONSTRAINT "sessions_time_check" CHECK("sessions"."start_minutes" >= 0 and "sessions"."end_minutes" <= 1440 and "sessions"."start_minutes" < "sessions"."end_minutes")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_course_label_unique` ON `sessions` (`course_id`,`label`);