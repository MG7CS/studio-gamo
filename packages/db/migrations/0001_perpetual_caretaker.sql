CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`musician_id` text,
	`step` text DEFAULT 'identity' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_at` integer,
	FOREIGN KEY (`musician_id`) REFERENCES `musician_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`status` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `gig_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `churches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`service_zone` text,
	`contact_user_id` text NOT NULL,
	FOREIGN KEY (`contact_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gig_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`position_id` text NOT NULL,
	`musician_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`confirmation_deadline` integer,
	FOREIGN KEY (`position_id`) REFERENCES `gig_positions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`musician_id`) REFERENCES `musician_profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gig_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`gig_id` text NOT NULL,
	`instrument` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	FOREIGN KEY (`gig_id`) REFERENCES `gigs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `gigs` (
	`id` text PRIMARY KEY NOT NULL,
	`church_id` text NOT NULL,
	`plan` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`rehearsal_at` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`location_zone` text,
	FOREIGN KEY (`church_id`) REFERENCES `churches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `musician_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`bio` text,
	`home_zone` text,
	`travel_radius_miles` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
