CREATE TYPE "public"."approval_kind" AS ENUM('clarification', 'consequence_gate', 'consent_disclosure', 'memory_update');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'approved_with_edits', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."clinician_kind" AS ENUM('psychologist', 'psychiatrist', 'therapist', 'occupational_therapist', 'general_practitioner', 'other');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."data_category" AS ENUM('personal', 'functional', 'clinical', 'support', 'preference', 'contextual', 'outcome', 'administrative');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('unvalidated', 'partially_structured', 'professionally_documented', 'contradicted', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."provenance_kind" AS ENUM('patient_reported', 'clinician_documented', 'external_document', 'system_generated', 'ai_inferred');--> statement-breakpoint
CREATE TYPE "public"."relationship_status" AS ENUM('pending', 'active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('patient', 'clinician');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'care_team', 'explicitly_shared');--> statement-breakpoint
CREATE TYPE "public"."workflow_state" AS ENUM('triggered', 'running', 'awaiting_clarification', 'awaiting_approval', 'executing', 'closed', 'blocked', 'failed');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"kind" "approval_kind" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"yoxa_request_id" text NOT NULL,
	"yoxa_deployment_id" text NOT NULL,
	"options" jsonb,
	"selected_option_id" text,
	"override_message" text,
	"prompt" text NOT NULL,
	"proposed_content" jsonb,
	"recipient_user_id" uuid,
	"disclosure_categories" "data_category"[],
	"assigned_to_user_id" uuid NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"edited_content" jsonb,
	"decision_note" text,
	"delivered_to_yoxa_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_run_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"recipient_user_id" uuid,
	"approval_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"workflow_run_id" uuid,
	"actor" text NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"resource" text,
	"ai_inferred" boolean DEFAULT false NOT NULL,
	"detail" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"clinician_user_id" uuid NOT NULL,
	"status" "relationship_status" DEFAULT 'pending' NOT NULL,
	"scope" "data_category"[] NOT NULL,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"recipient_user_id" uuid,
	"categories" "data_category"[] NOT NULL,
	"status" "consent_status" DEFAULT 'active' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"source_approval_id" uuid
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"workflow_run_id" uuid,
	"recipient_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"due_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"category" "data_category" NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"structured" jsonb,
	"provenance" "provenance_kind" NOT NULL,
	"source_user_id" uuid,
	"evidence_status" "evidence_status" DEFAULT 'unvalidated' NOT NULL,
	"uncertainty_note" text,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"superseded_at" timestamp with time zone,
	"workflow_run_id" uuid
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"clinician_kind" "clinician_kind",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"yoxa_run_id" text,
	"patient_id" uuid NOT NULL,
	"initiated_by_user_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"state" "workflow_state" DEFAULT 'triggered' NOT NULL,
	"current_step" text,
	"next_action" text,
	"closure_reason" text,
	"trigger_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_relationships" ADD CONSTRAINT "care_relationships_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_relationships" ADD CONSTRAINT "care_relationships_clinician_user_id_users_id_fk" FOREIGN KEY ("clinician_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workflow_run_id_workflow_runs_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_source_user_id_users_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_yoxa_request_idx" ON "approvals" USING btree ("yoxa_request_id");--> statement-breakpoint
CREATE INDEX "approvals_assignee_status_idx" ON "approvals" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "approvals_run_idx" ON "approvals" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "artifacts_run_idx" ON "artifacts" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "audit_patient_time_idx" ON "audit_events" USING btree ("patient_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_run_idx" ON "audit_events" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "care_rel_unique_idx" ON "care_relationships" USING btree ("patient_id","clinician_user_id");--> statement-breakpoint
CREATE INDEX "care_rel_patient_idx" ON "care_relationships" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "consents_patient_idx" ON "consents" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "consents_recipient_idx" ON "consents" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_user_idx" ON "patients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "records_patient_occurred_idx" ON "records" USING btree ("patient_id","occurred_at");--> statement-breakpoint
CREATE INDEX "records_patient_category_idx" ON "records" USING btree ("patient_id","category");--> statement-breakpoint
CREATE INDEX "records_supersedes_idx" ON "records" USING btree ("supersedes_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_event_id_idx" ON "webhook_events" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_idempotency_idx" ON "workflow_runs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_runs_yoxa_idx" ON "workflow_runs" USING btree ("yoxa_run_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_patient_idx" ON "workflow_runs" USING btree ("patient_id");