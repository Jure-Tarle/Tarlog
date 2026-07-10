CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"device_id" text,
	"last_used_at" bigint,
	"expires_at" bigint,
	"revoked_at" bigint,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"approver_id" text,
	"status" text DEFAULT 'pending',
	"reason" text,
	"created_at" bigint NOT NULL,
	"decided_at" bigint
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"organization_id" text,
	"main_account_id" text NOT NULL,
	"device_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before_json" jsonb,
	"after_json" jsonb,
	"reason" text,
	"timestamp" bigint NOT NULL,
	"source" text NOT NULL,
	"server_revision" bigint,
	"local_revision" integer NOT NULL,
	"correlation_id" text
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"encrypted" boolean DEFAULT false,
	"checksum_sha256" text,
	"integrity_status" text DEFAULT 'unknown',
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"scope" text NOT NULL,
	"customer_id" text,
	"project_id" text,
	"task_id" text,
	"hourly_rate_cents" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"project_id" text NOT NULL,
	"budget_hours" numeric(10, 2),
	"budget_money_cents" bigint,
	"consumed_hours" numeric(10, 2) DEFAULT '0',
	"consumed_money_cents" bigint DEFAULT 0,
	"warn_thresholds" jsonb,
	"period" text DEFAULT 'total',
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "compliance_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text,
	"country_code" char(2) NOT NULL,
	"jurisdiction_name" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"rules_json" jsonb NOT NULL,
	"source_note" text NOT NULL,
	"severity" text NOT NULL,
	"user_visible_explanation" text NOT NULL,
	"calculation_version" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_results" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"compliance_profile_id" text NOT NULL,
	"scope" text NOT NULL,
	"scope_date" date,
	"time_entry_id" text,
	"rule_code" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"override_reason" text,
	"overridden_by_device" text,
	"calculation_version" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conflict_records" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"conflict_case" integer NOT NULL,
	"local_version_json" jsonb NOT NULL,
	"server_version_json" jsonb NOT NULL,
	"suggested_merge_json" jsonb,
	"resolution" text DEFAULT 'unresolved',
	"reason" text,
	"resolved_by_device" text,
	"server_revision" bigint,
	"correlation_id" text,
	"created_at" bigint NOT NULL,
	"resolved_at" bigint
);
--> statement-breakpoint
CREATE TABLE "customer_portal_access" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"email" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"revoked_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"contact_person" text,
	"email" text,
	"phone" text,
	"billing_address" text,
	"shipping_address" text,
	"vat_id" text,
	"customer_number" text,
	"payment_term_days" integer DEFAULT 14,
	"default_currency" char(3),
	"default_hourly_rate_cents" bigint,
	"default_day_rate_cents" bigint,
	"default_rounding_rule_id" text,
	"default_invoice_note" text,
	"default_language" text DEFAULT 'de-DE',
	"pdf_template_id" text,
	"invoice_template_id" text,
	"internal_notes" text,
	"external_notes" text,
	"status" text DEFAULT 'active',
	"default_tax_rate" numeric(5, 2) DEFAULT '19.00',
	"reverse_charge_hint" boolean DEFAULT false,
	"small_business_hint" boolean DEFAULT false,
	"preferred_export_detail" text DEFAULT 'detailed',
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "day_rate_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"scope" text NOT NULL,
	"customer_id" text,
	"project_id" text,
	"task_id" text,
	"full_day_rate_cents" bigint NOT NULL,
	"half_day_rate_cents" bigint,
	"full_day_min_hours" numeric(5, 2) NOT NULL,
	"half_day_min_hours" numeric(5, 2),
	"min_billing" text DEFAULT 'none',
	"extra_hours_billing" text DEFAULT 'none',
	"valid_from" date NOT NULL,
	"valid_until" date,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"device_name" text NOT NULL,
	"platform" text NOT NULL,
	"app_version" text NOT NULL,
	"last_sync_at" bigint,
	"sync_status" text DEFAULT 'offline',
	"local_db_version" integer NOT NULL,
	"server_connected" boolean DEFAULT false,
	"permission_status" text DEFAULT 'active',
	"revoked" boolean DEFAULT false,
	"connected_at" bigint NOT NULL,
	"last_active_timer_id" text,
	"live_channel_status" text DEFAULT 'none',
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "export_files" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"export_id" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"export_number" text,
	"format" text NOT NULL,
	"variant" text,
	"filter_json" jsonb NOT NULL,
	"period_start" date,
	"period_end" date,
	"timezone" text NOT NULL,
	"checksum" text,
	"created_by_device" text,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixed_fee_contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"project_id" text,
	"customer_id" text,
	"type" text NOT NULL,
	"total_fee_cents" bigint,
	"monthly_fee_cents" bigint,
	"budget_hours" numeric(10, 2),
	"internal_cost_rate_cents" bigint,
	"included_hours" numeric(10, 2),
	"rollover_unused" boolean DEFAULT false,
	"expire_unused" boolean DEFAULT false,
	"extra_hours_rate_cents" bigint,
	"milestones_json" jsonb,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit" text NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"net_amount_cents" bigint NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_time_entries" (
	"invoice_id" text NOT NULL,
	"time_entry_id" text NOT NULL,
	"invoice_item_id" text,
	"main_account_id" text NOT NULL,
	"billed_duration_seconds" integer NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "invoice_time_entries_invoice_id_time_entry_id_pk" PRIMARY KEY("invoice_id","time_entry_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"invoice_number" text,
	"number_range_id" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft',
	"dunning_status" text DEFAULT 'none',
	"issue_date" date NOT NULL,
	"service_period_start" date,
	"service_period_end" date,
	"service_date" date,
	"payment_due_date" date,
	"currency" char(3) NOT NULL,
	"net_amount_cents" bigint NOT NULL,
	"tax_amount_cents" bigint NOT NULL,
	"gross_amount_cents" bigint NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"small_business_note" text,
	"reverse_charge_note" text,
	"customer_snapshot" jsonb NOT NULL,
	"project_snapshot" jsonb,
	"rate_snapshot" jsonb NOT NULL,
	"rounding_snapshot" jsonb NOT NULL,
	"finalized_at" bigint,
	"cancels_invoice_id" text,
	"notes" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "local_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"device_id" text NOT NULL,
	"app_lock_enabled" boolean DEFAULT false,
	"app_lock_method" text DEFAULT 'none',
	"biometric_kind" text DEFAULT 'none',
	"db_encryption_enabled" boolean DEFAULT false,
	"telemetry_opt_in" boolean DEFAULT false,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"mode" text DEFAULT 'local' NOT NULL,
	"email" text,
	"company_name" text,
	"default_currency" char(3) DEFAULT 'EUR' NOT NULL,
	"default_locale" text DEFAULT 'de-DE' NOT NULL,
	"default_timezone" text DEFAULT 'Europe/Berlin' NOT NULL,
	"default_compliance_profile_id" text,
	"password_hash" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"status" text DEFAULT 'active',
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"name" text NOT NULL,
	"customer_id" text,
	"description" text,
	"status" text DEFAULT 'active',
	"project_code" text,
	"color" text,
	"start_date" date,
	"end_date" date,
	"billing_type" text NOT NULL,
	"hourly_rate_cents" bigint,
	"day_rate_cents" bigint,
	"fixed_fee_cents" bigint,
	"retainer_id" text,
	"budget_hours" numeric(10, 2),
	"budget_money_cents" bigint,
	"budget_warn_thresholds" jsonb,
	"planned_hours" numeric(10, 2),
	"actual_hours" numeric(10, 2),
	"billable_hours" numeric(10, 2),
	"non_billable_hours" numeric(10, 2),
	"rounding_rule_id" text,
	"default_task_id" text,
	"allowed_task_ids" jsonb,
	"mandatory_tags" jsonb,
	"description_required" boolean DEFAULT false,
	"backdating_allowed" boolean DEFAULT true,
	"backdating_reason_required" boolean DEFAULT false,
	"max_retroactive_edit_days" integer,
	"internal_notes" text,
	"external_description" text,
	"invoice_template_id" text,
	"export_template_id" text,
	"archived_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "rounding_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"name" text NOT NULL,
	"mode" text NOT NULL,
	"interval_minutes" integer,
	"min_duration_seconds" integer,
	"scope" text DEFAULT 'global',
	"valid_from" date NOT NULL,
	"valid_until" date,
	"calculation_version" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"user_id" text,
	"session_hash" text NOT NULL,
	"device_id" text,
	"ip_hash" text,
	"user_agent" text,
	"expires_at" bigint NOT NULL,
	"revoked_at" bigint,
	"created_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"scope" text NOT NULL,
	"device_id" text,
	"key" text NOT NULL,
	"value_json" jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "sync_events" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"device_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"operation" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"hlc" text NOT NULL,
	"local_revision" integer NOT NULL,
	"server_revision" bigint,
	"correlation_id" text,
	"applied" boolean DEFAULT false,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_states" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"device_id" text NOT NULL,
	"last_pushed_server_revision" bigint DEFAULT 0,
	"last_pulled_server_revision" bigint DEFAULT 0,
	"last_hlc" text,
	"pending_event_count" integer DEFAULT 0,
	"last_error" text,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"project_id" text,
	"name" text NOT NULL,
	"description" text,
	"default_billable" boolean DEFAULT true,
	"default_hourly_rate_cents" bigint,
	"default_day_rate_cents" bigint,
	"default_description_template" text,
	"cost_center" text,
	"color" text,
	"status" text DEFAULT 'active',
	"sort_order" integer DEFAULT 0,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"project_id" text,
	"task_id" text,
	"customer_id" text,
	"status" text NOT NULL,
	"timezone" text NOT NULL,
	"actual_started_at" bigint NOT NULL,
	"actual_ended_at" bigint,
	"actual_duration_seconds" integer NOT NULL,
	"break_duration_seconds" integer DEFAULT 0,
	"net_work_duration_seconds" integer NOT NULL,
	"billing_duration_seconds" integer NOT NULL,
	"rounding_rule_id" text,
	"rounding_delta_seconds" integer DEFAULT 0,
	"rounding_reason" text,
	"calculation_version" integer NOT NULL,
	"rate_snapshot" jsonb,
	"billing_amount_snapshot" bigint,
	"description" text,
	"summary" text,
	"deliverable" text,
	"blocker" text,
	"next_step" text,
	"internal_note" text,
	"is_billable" boolean DEFAULT true,
	"client_visible" boolean DEFAULT true,
	"source" text NOT NULL,
	"backdate_reason" text,
	"correction_reason" text,
	"is_backdated" boolean DEFAULT false,
	"crosses_midnight" boolean DEFAULT false,
	"device_started_on" text,
	"server_received_at" bigint,
	"clock_trust" text DEFAULT 'trusted',
	"invoice_id" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "time_entry_breaks" (
	"id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"time_entry_id" text NOT NULL,
	"started_at" bigint NOT NULL,
	"ended_at" bigint,
	"duration_seconds" integer NOT NULL,
	"kind" text DEFAULT 'manual',
	"counts_as_rest" boolean DEFAULT true,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
CREATE TABLE "time_entry_tags" (
	"time_entry_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"main_account_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "time_entry_tags_time_entry_id_tag_id_pk" PRIMARY KEY("time_entry_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "timer_states" (
	"timer_id" text PRIMARY KEY NOT NULL,
	"main_account_id" text NOT NULL,
	"current_time_entry_id" text,
	"status" text DEFAULT 'idle' NOT NULL,
	"project_id" text,
	"task_id" text,
	"started_at" bigint,
	"paused_at" bigint,
	"accumulated_pause_seconds" integer DEFAULT 0 NOT NULL,
	"active_pause_started_at" bigint,
	"device_started_on" text NOT NULL,
	"last_modified_by_device" text NOT NULL,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"description_required" boolean DEFAULT false,
	"billing_status" text DEFAULT 'undecided',
	"compliance_warnings" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"email" text,
	"display_name" text NOT NULL,
	"password_hash" text,
	"status" text DEFAULT 'active',
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"sync_version" integer DEFAULT 0 NOT NULL,
	"server_revision" bigint,
	"local_revision" integer DEFAULT 0 NOT NULL,
	"hlc" text,
	"last_modified_by_device" text
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_rates" ADD CONSTRAINT "billing_rates_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_rates" ADD CONSTRAINT "billing_rates_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_rates" ADD CONSTRAINT "billing_rates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_rates" ADD CONSTRAINT "billing_rates_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_profiles" ADD CONSTRAINT "compliance_profiles_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_results" ADD CONSTRAINT "compliance_results_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_results" ADD CONSTRAINT "compliance_results_compliance_profile_id_compliance_profiles_id_fk" FOREIGN KEY ("compliance_profile_id") REFERENCES "public"."compliance_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_results" ADD CONSTRAINT "compliance_results_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_results" ADD CONSTRAINT "compliance_results_overridden_by_device_devices_id_fk" FOREIGN KEY ("overridden_by_device") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_records" ADD CONSTRAINT "conflict_records_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflict_records" ADD CONSTRAINT "conflict_records_resolved_by_device_devices_id_fk" FOREIGN KEY ("resolved_by_device") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_portal_access" ADD CONSTRAINT "customer_portal_access_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_portal_access" ADD CONSTRAINT "customer_portal_access_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_default_rounding_rule_id_rounding_rules_id_fk" FOREIGN KEY ("default_rounding_rule_id") REFERENCES "public"."rounding_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_rate_rules" ADD CONSTRAINT "day_rate_rules_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_rate_rules" ADD CONSTRAINT "day_rate_rules_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_rate_rules" ADD CONSTRAINT "day_rate_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_rate_rules" ADD CONSTRAINT "day_rate_rules_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_files" ADD CONSTRAINT "export_files_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_files" ADD CONSTRAINT "export_files_export_id_exports_id_fk" FOREIGN KEY ("export_id") REFERENCES "public"."exports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_created_by_device_devices_id_fk" FOREIGN KEY ("created_by_device") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_fee_contracts" ADD CONSTRAINT "fixed_fee_contracts_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_fee_contracts" ADD CONSTRAINT "fixed_fee_contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixed_fee_contracts" ADD CONSTRAINT "fixed_fee_contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_time_entries" ADD CONSTRAINT "invoice_time_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_time_entries" ADD CONSTRAINT "invoice_time_entries_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_time_entries" ADD CONSTRAINT "invoice_time_entries_invoice_item_id_invoice_items_id_fk" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."invoice_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_time_entries" ADD CONSTRAINT "invoice_time_entries_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_profiles" ADD CONSTRAINT "local_profiles_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_profiles" ADD CONSTRAINT "local_profiles_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_retainer_id_fixed_fee_contracts_id_fk" FOREIGN KEY ("retainer_id") REFERENCES "public"."fixed_fee_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_rounding_rule_id_rounding_rules_id_fk" FOREIGN KEY ("rounding_rule_id") REFERENCES "public"."rounding_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_default_task_id_tasks_id_fk" FOREIGN KEY ("default_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounding_rules" ADD CONSTRAINT "rounding_rules_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_states" ADD CONSTRAINT "sync_states_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_states" ADD CONSTRAINT "sync_states_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_rounding_rule_id_rounding_rules_id_fk" FOREIGN KEY ("rounding_rule_id") REFERENCES "public"."rounding_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_device_started_on_devices_id_fk" FOREIGN KEY ("device_started_on") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_breaks" ADD CONSTRAINT "time_entry_breaks_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_breaks" ADD CONSTRAINT "time_entry_breaks_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_tags" ADD CONSTRAINT "time_entry_tags_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_tags" ADD CONSTRAINT "time_entry_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_tags" ADD CONSTRAINT "time_entry_tags_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_states" ADD CONSTRAINT "timer_states_main_account_id_main_accounts_id_fk" FOREIGN KEY ("main_account_id") REFERENCES "public"."main_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_states" ADD CONSTRAINT "timer_states_current_time_entry_id_time_entries_id_fk" FOREIGN KEY ("current_time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_states" ADD CONSTRAINT "timer_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_states" ADD CONSTRAINT "timer_states_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_states" ADD CONSTRAINT "timer_states_device_started_on_devices_id_fk" FOREIGN KEY ("device_started_on") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_states" ADD CONSTRAINT "timer_states_last_modified_by_device_devices_id_fk" FOREIGN KEY ("last_modified_by_device") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_api_tokens_main_account" ON "api_tokens" USING btree ("main_account_id");--> statement-breakpoint
CREATE INDEX "ix_approvals_entity" ON "approvals" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "ix_approvals_status" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ix_attachments_entity" ON "attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ix_audit_logs_main_account" ON "audit_logs" USING btree ("main_account_id");--> statement-breakpoint
CREATE INDEX "ix_audit_logs_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ix_audit_logs_timestamp" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "ix_billing_rates_valid_from" ON "billing_rates" USING btree ("valid_from");--> statement-breakpoint
CREATE INDEX "ix_billing_rates_resolution" ON "billing_rates" USING btree ("scope","project_id","task_id","valid_from");--> statement-breakpoint
CREATE INDEX "ix_budgets_project" ON "budgets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ix_compliance_results_scope_date" ON "compliance_results" USING btree ("scope_date");--> statement-breakpoint
CREATE INDEX "ix_compliance_results_severity" ON "compliance_results" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "ix_conflict_records_main_account" ON "conflict_records" USING btree ("main_account_id");--> statement-breakpoint
CREATE INDEX "ix_conflict_records_entity" ON "conflict_records" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "ix_conflict_records_resolution" ON "conflict_records" USING btree ("resolution");--> statement-breakpoint
CREATE INDEX "ix_customer_portal_access_customer" ON "customer_portal_access" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ix_customers_main_account" ON "customers" USING btree ("main_account_id");--> statement-breakpoint
CREATE INDEX "ix_customers_status" ON "customers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_customers_number" ON "customers" USING btree ("main_account_id","customer_number");--> statement-breakpoint
CREATE INDEX "ix_devices_main_account" ON "devices" USING btree ("main_account_id");--> statement-breakpoint
CREATE INDEX "ix_devices_last_sync_at" ON "devices" USING btree ("last_sync_at");--> statement-breakpoint
CREATE INDEX "ix_export_files_export" ON "export_files" USING btree ("export_id");--> statement-breakpoint
CREATE INDEX "ix_exports_main_account" ON "exports" USING btree ("main_account_id");--> statement-breakpoint
CREATE INDEX "ix_exports_created_at" ON "exports" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_exports_number" ON "exports" USING btree ("main_account_id","export_number");--> statement-breakpoint
CREATE INDEX "ix_invoice_items_invoice" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "ix_invoice_time_entries_invoice" ON "invoice_time_entries" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "ix_invoices_main_account" ON "invoices" USING btree ("main_account_id");--> statement-breakpoint
CREATE INDEX "ix_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_invoices_number" ON "invoices" USING btree ("main_account_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_main_accounts_email" ON "main_accounts" USING btree ("email") WHERE "main_accounts"."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_memberships_org_user" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_organizations_slug" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "ix_permissions_role" ON "permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_permissions_role_resource_action" ON "permissions" USING btree ("role_id","resource","action");--> statement-breakpoint
CREATE INDEX "ix_project_members_project" ON "project_members" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_project_members_project_user" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "ix_projects_main_account" ON "projects" USING btree ("main_account_id");--> statement-breakpoint
CREATE INDEX "ix_projects_customer" ON "projects" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ix_projects_status" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_projects_code" ON "projects" USING btree ("main_account_id","project_code");--> statement-breakpoint
CREATE INDEX "ix_sessions_main_account" ON "sessions" USING btree ("main_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_settings_key" ON "settings" USING btree ("main_account_id","scope","device_id","key");--> statement-breakpoint
CREATE INDEX "ix_sync_events_main_account" ON "sync_events" USING btree ("main_account_id");--> statement-breakpoint
CREATE INDEX "ix_sync_events_entity" ON "sync_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ix_sync_events_hlc" ON "sync_events" USING btree ("hlc");--> statement-breakpoint
CREATE INDEX "ix_sync_events_server_revision" ON "sync_events" USING btree ("server_revision");--> statement-breakpoint
CREATE INDEX "ix_sync_events_created_at" ON "sync_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_sync_states_device" ON "sync_states" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "ix_sync_states_last_pulled" ON "sync_states" USING btree ("last_pulled_server_revision");--> statement-breakpoint
CREATE INDEX "ix_tags_main_account" ON "tags" USING btree ("main_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_tags_name" ON "tags" USING btree ("main_account_id","name");--> statement-breakpoint
CREATE INDEX "ix_tasks_main_account" ON "tasks" USING btree ("main_account_id");--> statement-breakpoint
CREATE INDEX "ix_time_entries_account_started" ON "time_entries" USING btree ("main_account_id","actual_started_at");--> statement-breakpoint
CREATE INDEX "ix_time_entries_project_started" ON "time_entries" USING btree ("project_id","actual_started_at");--> statement-breakpoint
CREATE INDEX "ix_time_entries_status" ON "time_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ix_time_entries_billable_invoice" ON "time_entries" USING btree ("is_billable","invoice_id");--> statement-breakpoint
CREATE INDEX "ix_time_entries_backdated" ON "time_entries" USING btree ("is_backdated");--> statement-breakpoint
CREATE INDEX "ix_time_entry_breaks_entry" ON "time_entry_breaks" USING btree ("time_entry_id");--> statement-breakpoint
CREATE INDEX "ix_time_entry_tags_entry" ON "time_entry_tags" USING btree ("time_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_timer_states_single_active" ON "timer_states" USING btree ("main_account_id") WHERE "timer_states"."status" IN ('running','paused');--> statement-breakpoint
CREATE UNIQUE INDEX "ux_users_email" ON "users" USING btree ("email");