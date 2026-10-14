CREATE TABLE `workspace_state` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`payload` text NOT NULL
);
