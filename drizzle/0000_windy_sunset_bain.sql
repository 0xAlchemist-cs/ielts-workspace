CREATE TABLE IF NOT EXISTS `app_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cet_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`section` text NOT NULL,
	`mode` text NOT NULL,
	`responses` text DEFAULT '{}' NOT NULL,
	`free_text` text,
	`correct_count` integer,
	`total_count` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cet_attempts_user` ON `cet_attempts` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cet_attempts_user_section` ON `cet_attempts` (`user_id`,`section`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cet_exam_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`exam` text NOT NULL,
	`test_mode` integer DEFAULT 0 NOT NULL,
	`current_section` text NOT NULL,
	`exam_start_time` integer NOT NULL,
	`section_start_time` integer,
	`answers` text DEFAULT '{}' NOT NULL,
	`timed_out` text DEFAULT '[]' NOT NULL,
	`submitted_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cet_exam_user` ON `cet_exam_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cet_exam_live` ON `cet_exam_sessions` (`user_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cet_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_profile` text NOT NULL,
	`section` text NOT NULL,
	`task_type` text NOT NULL,
	`difficulty` integer DEFAULT 3 NOT NULL,
	`topic` text DEFAULT 'general' NOT NULL,
	`prompt` text NOT NULL,
	`content` text,
	`questions` text,
	`reference_answer` text,
	`source` text NOT NULL,
	`audio_url` text,
	`duration_minutes` integer DEFAULT 20 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cet_tasks_exam_section` ON `cet_tasks` (`exam_profile`,`section`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cet_tasks_exam` ON `cet_tasks` (`exam_profile`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chunk_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`chunk_id` integer NOT NULL,
	`type` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chunk_events` ON `chunk_events` (`user_id`,`chunk_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`text` text NOT NULL,
	`pattern` text DEFAULT '' NOT NULL,
	`meaning_en` text DEFAULT '' NOT NULL,
	`meaning_zh` text DEFAULT '' NOT NULL,
	`examples` text DEFAULT '[]' NOT NULL,
	`register` text DEFAULT 'neutral' NOT NULL,
	`source_content_id` integer,
	`retrieval_strength` integer DEFAULT 0 NOT NULL,
	`activated_at` integer,
	`last_review_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chunks_user` ON `chunks` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chunks_source` ON `chunks` (`source_content_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `content_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`content_id` integer NOT NULL,
	`skill` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`last_used_at` integer NOT NULL,
	`times_used` integer DEFAULT 1 NOT NULL,
	`completion_status` text DEFAULT 'in_progress' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_content_history_user_content` ON `content_history` (`user_id`,`content_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_content_history_user` ON `content_history` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `contents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`topic` text NOT NULL,
	`cefr` text NOT NULL,
	`cefr_meta` text DEFAULT '{}' NOT NULL,
	`difficulty` integer DEFAULT 3 NOT NULL,
	`vocab_density` real DEFAULT 0.5 NOT NULL,
	`grammar_complexity` integer DEFAULT 3 NOT NULL,
	`ielts_relevance` integer DEFAULT 3 NOT NULL,
	`summary_en` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`audio_url` text,
	`minutes` integer DEFAULT 10 NOT NULL,
	`fingerprint` text,
	`exam_profile` text DEFAULT 'ielts' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_contents_type` ON `contents` (`type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_contents_exam` ON `contents` (`exam_profile`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `daily_missions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`plan` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`counters` text DEFAULT '{"exposure":0,"understood":0,"retrieved":0,"used":0,"retained":0}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_mission_user_date` ON `daily_missions` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `dictionary` (
	`word` text PRIMARY KEY NOT NULL,
	`phonetic` text DEFAULT '' NOT NULL,
	`definition_en` text DEFAULT '' NOT NULL,
	`translation_zh` text DEFAULT '' NOT NULL,
	`pos` text DEFAULT '' NOT NULL,
	`collins` integer DEFAULT 0 NOT NULL,
	`oxford` integer DEFAULT 0 NOT NULL,
	`tag` text DEFAULT '' NOT NULL,
	`bnc` integer DEFAULT 0 NOT NULL,
	`frq` integer DEFAULT 0 NOT NULL,
	`exchange` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `errors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`category` text NOT NULL,
	`wrong_form` text NOT NULL,
	`correct_form` text NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`source_module` text DEFAULT 'review' NOT NULL,
	`language_item_id` integer,
	`severity` text DEFAULT 'medium' NOT NULL,
	`occurrence_count` integer DEFAULT 1 NOT NULL,
	`corrected_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_errors_user_status` ON `errors` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_errors_user_category` ON `errors` (`user_id`,`category`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `external_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`tool` text DEFAULT 'chatgpt_external' NOT NULL,
	`skill` text NOT NULL,
	`duration_minutes` integer DEFAULT 10 NOT NULL,
	`difficulty` text DEFAULT 'medium' NOT NULL,
	`self_assessment` integer DEFAULT 3 NOT NULL,
	`struggled_with` text,
	`mission_id` integer,
	`recommended_reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_external_user` ON `external_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `grammar_patterns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`pattern` text NOT NULL,
	`meaning` text DEFAULT '' NOT NULL,
	`meaning_zh` text DEFAULT '' NOT NULL,
	`examples` text DEFAULT '[]' NOT NULL,
	`kind` text DEFAULT 'grammar' NOT NULL,
	`retrieval_strength` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ielts_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`mode` text DEFAULT 'learning' NOT NULL,
	`responses` text,
	`score` real,
	`band` real,
	`sub_skill_results` text,
	`transfer_results` text,
	`strategy_issues` text DEFAULT '[]' NOT NULL,
	`language_errors` text DEFAULT '[]' NOT NULL,
	`duration_minutes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ielts_attempts_user` ON `ielts_attempts` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ielts_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`skill` text NOT NULL,
	`score` real NOT NULL,
	`band_details` text,
	`source` text DEFAULT 'self' NOT NULL,
	`date` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ielts_skill_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`skill` text NOT NULL,
	`estimated_band` real,
	`band_low` real,
	`band_high` real,
	`confidence` text DEFAULT 'low' NOT NULL,
	`sample_count` integer DEFAULT 0 NOT NULL,
	`sub_skill_scores` text DEFAULT '{}' NOT NULL,
	`strategy_issues` text DEFAULT '[]' NOT NULL,
	`target_band` real,
	`last_assessed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_ielts_profile_user_skill` ON `ielts_skill_profiles` (`user_id`,`skill`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ielts_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_type` text NOT NULL,
	`skill` text NOT NULL,
	`difficulty` integer DEFAULT 3 NOT NULL,
	`topic` text DEFAULT 'general' NOT NULL,
	`prompt` text NOT NULL,
	`content` text,
	`questions` text,
	`explanations` text,
	`target_chunk_ids` text DEFAULT '[]' NOT NULL,
	`estimated_band` real DEFAULT 6 NOT NULL,
	`time_limit_minutes` integer DEFAULT 20 NOT NULL,
	`source` text DEFAULT 'seed' NOT NULL,
	`audio_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ieltscb_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`task_id` integer NOT NULL,
	`attempt_id` integer,
	`paper_id` integer NOT NULL,
	`chapters_id` integer NOT NULL,
	`p_type` integer NOT NULL,
	`tid` integer NOT NULL,
	`classify` integer NOT NULL,
	`source_url` text NOT NULL,
	`title` text NOT NULL,
	`breadcrumb` text,
	`parser_version` text NOT NULL,
	`raw_hash` text NOT NULL,
	`raw_snapshot` text,
	`canonical` text,
	`import_warnings` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ieltscb_imports_user` ON `ieltscb_imports` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ieltscb_imports_report` ON `ieltscb_imports` (`user_id`,`chapters_id`,`paper_id`,`p_type`,`tid`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ieltscb_imports_test` ON `ieltscb_imports` (`user_id`,`chapters_id`,`paper_id`,`p_type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `imported_resources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`resource_type` text NOT NULL,
	`format` text NOT NULL,
	`mime_type` text DEFAULT '' NOT NULL,
	`file_size` integer NOT NULL,
	`content_hash` text NOT NULL,
	`storage_key` text NOT NULL,
	`status` text NOT NULL,
	`exam_profile` text DEFAULT 'ielts' NOT NULL,
	`error` text,
	`content_id` integer,
	`owns_content` integer,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_imported_hash` ON `imported_resources` (`user_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_imported_user` ON `imported_resources` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `learning_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`ielts_overall` real,
	`ielts_listening` real,
	`ielts_reading` real,
	`ielts_writing` real,
	`ielts_speaking` real,
	`cefr` text DEFAULT 'B1' NOT NULL,
	`immersion_level` integer DEFAULT 1 NOT NULL,
	`daily_minutes` integer DEFAULT 45 NOT NULL,
	`target_band` real,
	`grammar_weaknesses` text DEFAULT '[]' NOT NULL,
	`speaking_weaknesses` text DEFAULT '[]' NOT NULL,
	`listening_weaknesses` text DEFAULT '[]' NOT NULL,
	`listening_profile` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `learning_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`mission_id` integer,
	`type` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`summary` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `learning_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_snapshot_user_date` ON `learning_snapshots` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lexical_relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_type` text NOT NULL,
	`from_id` integer NOT NULL,
	`to_type` text NOT NULL,
	`to_id` integer NOT NULL,
	`relation` text NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_rel_from` ON `lexical_relations` (`from_type`,`from_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `listening_clips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_id` integer NOT NULL,
	`order_no` integer NOT NULL,
	`start_ms` integer DEFAULT 0 NOT NULL,
	`end_ms` integer DEFAULT 0 NOT NULL,
	`text` text NOT NULL,
	`phenomena` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_clips_content` ON `listening_clips` (`content_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `listening_misses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`content_id` integer NOT NULL,
	`clip_id` integer,
	`missed` text NOT NULL,
	`category` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_listening_misses` ON `listening_misses` (`user_id`,`category`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `progress_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`metric` text NOT NULL,
	`previous_value` real NOT NULL,
	`new_value` real NOT NULL,
	`delta` real NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_progress_user_metric` ON `progress_events` (`user_id`,`metric`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `retrieval_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`item_type` text NOT NULL,
	`item_id` integer NOT NULL,
	`ease_factor` real DEFAULT 2.5 NOT NULL,
	`interval_days` real DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`fail_count` integer DEFAULT 0 NOT NULL,
	`last_quality` integer,
	`learning_state` text DEFAULT '{"state":"exposure","achievedAt":{},"contexts":[],"productionHits":0,"productionMisses":0,"contextualHits":0,"contextualMisses":0}' NOT NULL,
	`retention_score` integer DEFAULT 0 NOT NULL,
	`last_retention_check_at` integer,
	`retention_check_interval` integer DEFAULT 7 NOT NULL,
	`forgetting_detected` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_retrieval_item` ON `retrieval_items` (`user_id`,`item_type`,`item_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_retrieval_due` ON `retrieval_items` (`user_id`,`due_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `review_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`retrieval_item_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`mode` text NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`expected` text DEFAULT '' NOT NULL,
	`user_response` text DEFAULT '' NOT NULL,
	`correct` integer DEFAULT 0 NOT NULL,
	`quality` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_history_item` ON `review_history` (`retrieval_item_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sentences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`content_id` integer NOT NULL,
	`order_no` integer NOT NULL,
	`text` text NOT NULL,
	`word_analysis` text,
	`sentence_analysis` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sentences_content` ON `sentences` (`content_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `shadow_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`content_id` integer NOT NULL,
	`clip_id` integer NOT NULL,
	`clip_text` text NOT NULL,
	`analysis` text,
	`engine` text DEFAULT 'clip-phenomena-notes' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `speaking_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`mission_id` integer,
	`prompt` text NOT NULL,
	`transcript` text NOT NULL,
	`audio_path` text,
	`feedback` text,
	`ielts_scores` text,
	`used_chunk_ids` text DEFAULT '[]' NOT NULL,
	`follow_up` text,
	`round` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`metrics` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_progress_user_date` ON `user_progress` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user_sentences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`ref_type` text NOT NULL,
	`ref_id` integer NOT NULL,
	`text` text NOT NULL,
	`quality` text DEFAULT 'ungraded' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`exam_profile` text DEFAULT 'ielts' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vocabularies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`headword` text NOT NULL,
	`pos` text DEFAULT '' NOT NULL,
	`cefr` text,
	`meaning_en` text DEFAULT '' NOT NULL,
	`meaning_zh` text DEFAULT '' NOT NULL,
	`example_en` text DEFAULT '' NOT NULL,
	`collocations` text DEFAULT '[]' NOT NULL,
	`audio_url` text,
	`status` text DEFAULT 'passive' NOT NULL,
	`listening_strength` integer DEFAULT 0 NOT NULL,
	`retrieval_strength` integer DEFAULT 0 NOT NULL,
	`last_review_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_vocab_user_word` ON `vocabularies` (`user_id`,`headword`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `word_lemmas` (
	`form` text PRIMARY KEY NOT NULL,
	`base` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `writing_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`task_type` text DEFAULT 'task2' NOT NULL,
	`prompt` text NOT NULL,
	`text` text NOT NULL,
	`feedback` text,
	`ielts_scores` text,
	`used_chunk_ids` text DEFAULT '[]' NOT NULL,
	`revision_text` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `wrong_practice_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`session_id` text NOT NULL,
	`error_id` integer NOT NULL,
	`source` text NOT NULL,
	`source_question` text,
	`practice_type` text NOT NULL,
	`result` text NOT NULL,
	`quality` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_wrong_practice_user` ON `wrong_practice_log` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_wrong_practice_session_stage` ON `wrong_practice_log` (`session_id`,`practice_type`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `wrong_practice_sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`error_id` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_wp_sessions_user` ON `wrong_practice_sessions` (`user_id`);