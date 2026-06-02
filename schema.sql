

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."network_entity_type" AS ENUM (
    'rack_equipment',
    'wire_diagram',
    'manual',
    'reservation'
);


ALTER TYPE "public"."network_entity_type" OWNER TO "postgres";


CREATE TYPE "public"."network_ip_status" AS ENUM (
    'assigned',
    'reserved',
    'conflict',
    'offline'
);


ALTER TYPE "public"."network_ip_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_constraint_if_not_exists"("t_name" "text", "c_name" "text", "c_def" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c_name) THEN
        EXECUTE 'ALTER TABLE ' || t_name || ' ADD CONSTRAINT ' || c_name || ' ' || c_def;
    END IF;
END;
$$;


ALTER FUNCTION "public"."add_constraint_if_not_exists"("t_name" "text", "c_name" "text", "c_def" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_access_logo"("_name" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Fast check: Allow if the user is the direct owner (file path starts with user_id)
  IF (split_part(_name, '/', 1)::uuid = auth.uid()) THEN
    RETURN true;
  END IF;

  -- Collaborative check: Allow if the logo path exists in a show the user is a member of
  RETURN EXISTS (
    SELECT 1 
    FROM public.shows s
    JOIN public.show_collaborators sc ON s.id = sc.show_id
    WHERE 
      -- Match the file path stored in the show's JSON data
      s.data->'info'->>'logo_path' = _name
      -- Check if the requesting user is a collaborator on that show
      AND sc.user_id = auth.uid()
  );
END;
$$;


ALTER FUNCTION "public"."can_access_logo"("_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- This will delete the user from the auth table, and the
  -- CASCADE constraint on the profiles table will delete their profile.
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."delete_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_configurable_switches_for_show"("p_show_id" bigint) RETURNS json
    LANGUAGE "sql"
    AS $$
    WITH rack_items AS (
        SELECT
            r.id as rack_id,
            r.rack_name,
            rei.id as rack_item_id,
            rei.instance_name as switch_name,
            et.switch_model_id
        FROM public.racks r
        JOIN public.rack_equipment_instances rei ON r.id = rei.rack_id
        JOIN public.equipment_templates et ON rei.template_id = et.id
        WHERE r.show_id = p_show_id AND et.switch_model_id IS NOT NULL
    ),
    configs AS (
        SELECT
            ri.rack_item_id,
            sc.id as switch_config_id
        FROM rack_items ri
        LEFT JOIN public.switch_configs sc ON ri.rack_item_id = sc.rack_item_id
    )
    SELECT json_agg(
        json_build_object(
            'rack_id', r.rack_id,
            'rack_name', r.rack_name,
            'items', (
                SELECT json_agg(
                    json_build_object(
                        'rack_item_id', ri.rack_item_id,
                        'switch_name', ri.switch_name,
                        'switch_config_id', c.switch_config_id
                    )
                )
                FROM rack_items ri
                LEFT JOIN configs c ON ri.rack_item_id = c.rack_item_id
                WHERE ri.rack_id = r.rack_id
            )
        )
    )
    FROM (SELECT DISTINCT rack_id, rack_name FROM rack_items) r;
$$;


ALTER FUNCTION "public"."get_configurable_switches_for_show"("p_show_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_most_used_equipment"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    most_used_name TEXT;
BEGIN
    SELECT
        et.manufacturer || ' ' || et.model_number INTO most_used_name
    FROM
        rack_equipment_instances rei
    JOIN
        equipment_templates et ON rei.template_id = et.id
    GROUP BY
        et.id, et.manufacturer, et.model_number
    ORDER BY
        COUNT(rei.template_id) DESC
    LIMIT 1;

    -- Return a default value if no equipment is found
    IF most_used_name IS NULL THEN
        RETURN 'N/A';
    END IF;

    RETURN most_used_name;
END;
$$;


ALTER FUNCTION "public"."get_most_used_equipment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_roles"() RETURNS "text"[]
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT array_agg(r.name)
    FROM public.user_roles ur
    JOIN public.roles r ON ur.role_id = r.id
    WHERE ur.user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_show"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Insert a new record into the show_collaborators table
  -- 'new.id' refers to the id of the newly inserted show
  -- 'new.user_id' refers to the user_id of the newly inserted show
  INSERT INTO public.show_collaborators (show_id, user_id, role)
  VALUES (new.id, new.user_id, 'owner');
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_show"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  f_name text;
  l_name text;
  core_tier_id uuid;
BEGIN
  -- Get metadata
  f_name := new.raw_user_meta_data ->> 'first_name';
  l_name := new.raw_user_meta_data ->> 'last_name';

  -- Validate
  IF f_name IS NULL OR f_name = '' THEN RAISE EXCEPTION 'First name is required.'; END IF;
  IF l_name IS NULL OR l_name = '' THEN RAISE EXCEPTION 'Last name is required.'; END IF;

  -- Get the ID for the 'core' tier to assign as default
  SELECT id INTO core_tier_id FROM public.tiers WHERE name = 'core';

  -- Create Profile with Default Tier
  INSERT INTO public.profiles (
      id, 
      first_name, 
      last_name, 
      company_name, 
      production_role, 
      production_role_other,
      tier_id -- Assign the tier relation
  )
  VALUES (
      new.id, 
      f_name, 
      l_name, 
      new.raw_user_meta_data ->> 'company_name', 
      new.raw_user_meta_data ->> 'production_role', 
      new.raw_user_meta_data ->> 'production_role_other',
      core_tier_id
  );

  -- Insert Default Email Templates (Existing logic preserved)
  INSERT INTO public.email_templates (user_id, category, name, subject, body, is_default)
  VALUES 
  (new.id, 'ROSTER', 'Default Roster Email', 'Availability Check: {{showName}}', 
   '<table cellpadding="0" cellspacing="0" width="100%" border="0" style="background-color: #111827;"><tbody><tr><td align="center" style="padding: 40px 10px;"><table width="600" style="background-color: #1F2937; border-radius: 12px; overflow: hidden; border: 1px solid #374151; font-family: Helvetica, Arial, sans-serif;"><tbody><tr><td style="background-color: #14B8A6; height: 6px;"></td></tr><tr><td style="padding: 30px 40px; border-bottom: 1px solid #374151;"><h1 style="color: #F9FAFB; margin: 0; font-size: 24px;"><strong>Availability Check</strong></h1><p style="color: #14B8A6; margin: 5px 0 0 0; font-size: 14px; font-weight: bold; text-transform: uppercase;"><strong>{{showName}}</strong></p></td></tr><tr><td style="padding: 40px;"><p style="color: #D1D5DB; font-size: 16px; line-height: 1.6;">Hey {{firstName}},</p><p style="color: #D1D5DB; font-size: 16px; line-height: 1.6;">We have an upcoming call for <strong>{{showName}}</strong> and are looking for crew.</p></td></tr></tbody></table></td></tr></tbody></table>', true),
  
  (new.id, 'CREW', 'Default Crew Email', 'Crew Assignment: {{showName}}', 
   '<table cellpadding="0" cellspacing="0" width="100%" border="0" style="background-color: #111827;"><tbody><tr><td align="center" style="padding: 40px 10px;"><table width="600" style="background-color: #1F2937; border-radius: 12px; overflow: hidden; border: 1px solid #374151;"><tbody><tr><td style="background-color: #3B82F6; height: 6px;"></td></tr><tr><td style="padding: 30px 40px; border-bottom: 1px solid #374151;"><h1 style="color: #F9FAFB; margin: 0; font-size: 24px;"><strong>Crew Assignment</strong></h1><p style="color: #3B82F6; margin: 5px 0 0; font-size: 14px; font-weight: bold; text-transform: uppercase;"><strong>{{showName}}</strong></p></td></tr></tbody></table></td></tr></tbody></table>', true);

  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_permissions_version"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE permissions_meta
  SET version = version + 1
  WHERE id = 1;
END;
$$;


ALTER FUNCTION "public"."increment_permissions_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_global_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_roles 
    WHERE user_id = auth.uid() 
      AND role = 'global_admin'
  );
END;
$$;


ALTER FUNCTION "public"."is_global_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_show_editor_or_owner"("_show_id" bigint) RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM show_collaborators
    WHERE show_id = _show_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'editor')
  );
$$;


ALTER FUNCTION "public"."is_show_editor_or_owner"("_show_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_show_member"("_show_id" bigint) RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM show_collaborators
    WHERE show_id = _show_id
    AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_show_member"("_show_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_show_owner"("_show_id" bigint) RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM shows
    WHERE id = _show_id
    AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_show_owner"("_show_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."suspend_user_by_id"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE auth.users SET banned_until = '9999-12-31T23:59:59Z' WHERE id = target_user_id;
END;
$$;


ALTER FUNCTION "public"."suspend_user_by_id"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unsuspend_user_by_id"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE auth.users SET banned_until = NULL WHERE id = target_user_id;
END;
$$;


ALTER FUNCTION "public"."unsuspend_user_by_id"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agent_api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "key_hash" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "name" "text" NOT NULL,
    "public_key" "text"
);


ALTER TABLE "public"."agent_api_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actor_id" "uuid",
    "target_id" "uuid",
    "action" "text",
    "details" "text"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "loom_id" "uuid" NOT NULL,
    "label_content" "text",
    "cable_type" "text",
    "length_ft" real,
    "origin" "jsonb",
    "destination" "jsonb",
    "origin_color" "text",
    "destination_color" "text",
    "is_rcvd" boolean DEFAULT false NOT NULL,
    "is_complete" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cables" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_device_id" "uuid" NOT NULL,
    "source_port_id" "text" NOT NULL,
    "destination_device_id" "uuid" NOT NULL,
    "destination_port_id" "text" NOT NULL,
    "cable_type" "text" NOT NULL,
    "label" "text",
    "length_ft" integer,
    "show_id" bigint NOT NULL
);


ALTER TABLE "public"."connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "name" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "is_default" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "email_templates_category_check" CHECK (("category" = ANY (ARRAY['ROSTER'::"text", 'CREW'::"text", 'HOURS'::"text", 'GENERAL'::"text"])))
);


ALTER TABLE "public"."email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "model_number" "text" NOT NULL,
    "manufacturer" "text",
    "ru_height" integer NOT NULL,
    "power_consumption_watts" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "folder_id" "uuid",
    "is_default" boolean DEFAULT false,
    "width" "text" DEFAULT 'full'::"text" NOT NULL,
    "ports" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "description" "text",
    "primary_image_url" "text",
    "gallery_image_urls" "jsonb",
    "specifications" "jsonb",
    "io_ports" "jsonb",
    "original_id" "uuid",
    "has_ip_address" boolean DEFAULT false,
    "switch_model_id" "uuid",
    "is_module" boolean DEFAULT false,
    "module_type" "text",
    "slots" "jsonb" DEFAULT '[]'::"jsonb",
    "depth" numeric(10,2) DEFAULT 0.00,
    "is_adapter" boolean DEFAULT false,
    "is_connector" boolean DEFAULT false,
    "slot_type" "text",
    "width_bays" numeric,
    "is_patch_panel" boolean DEFAULT false
);


ALTER TABLE "public"."equipment_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_restrictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "feature_name" "text" NOT NULL,
    "permitted_tiers" "text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."feature_restrictions" OWNER TO "postgres";


COMMENT ON TABLE "public"."feature_restrictions" IS 'Stores feature restrictions for different user roles. The excluded_roles column contains a list of role names that should not have access to the feature.';



CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_default" boolean DEFAULT false,
    "nomenclature_prefix" "text"
);


ALTER TABLE "public"."folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."label_stocks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "page_width" double precision NOT NULL,
    "page_height" double precision NOT NULL,
    "top_margin" double precision NOT NULL,
    "left_margin" double precision NOT NULL,
    "row_spacing" double precision DEFAULT 0,
    "col_spacing" double precision DEFAULT 0,
    "rows_per_page" integer NOT NULL,
    "cols_per_page" integer NOT NULL,
    "corner_radius" double precision DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."label_stocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."label_templates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "stock_id" "uuid",
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "elements" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_public" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "label_templates_category_check" CHECK (("category" = ANY (ARRAY['case'::"text", 'loom'::"text", 'generic'::"text"])))
);


ALTER TABLE "public"."label_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."looms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "show_id" bigint NOT NULL,
    "source_loc" "text",
    "dest_loc" "text",
    "origin_color" "text" DEFAULT 'Blue'::"text",
    "destination_color" "text" DEFAULT 'Blue'::"text"
);


ALTER TABLE "public"."looms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."network_ip_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "show_id" bigint NOT NULL,
    "vlan_id" "uuid",
    "entity_type" "public"."network_entity_type" NOT NULL,
    "entity_id" "uuid",
    "ip_address" "inet",
    "ip_end" "inet",
    "mac_address" "text",
    "hostname" "text",
    "department" "text",
    "location" "text",
    "status" "public"."network_ip_status" DEFAULT 'assigned'::"public"."network_ip_status" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_ip_range" CHECK ((("ip_end" IS NULL) OR ("ip_end" >= "ip_address")))
);


ALTER TABLE "public"."network_ip_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "show_id" bigint,
    "parent_entity_type" "text" NOT NULL,
    "parent_entity_id" "text" NOT NULL,
    "content" "text",
    "is_resolved" boolean DEFAULT false,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."panel_equipment_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "panel_instance_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "parent_instance_id" "uuid",
    "slot_id" "uuid",
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."panel_equipment_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."panel_equipment_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "folder_id" "uuid",
    "name" "text" NOT NULL,
    "manufacturer" "text",
    "model_number" "text",
    "description" "text",
    "is_default" boolean DEFAULT false,
    "width_units" numeric DEFAULT 1,
    "depth_in" numeric DEFAULT 0,
    "slot_type" "text",
    "panel_slots" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "visual_style" "text" DEFAULT 'standard'::"text",
    "ports" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."panel_equipment_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."panel_folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "parent_id" "uuid",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_default" boolean DEFAULT false
);


ALTER TABLE "public"."panel_folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions_meta" (
    "id" smallint DEFAULT 1 NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "one_row_only" CHECK (("id" = 1))
);


ALTER TABLE "public"."permissions_meta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "company_name" "text",
    "production_role" "text",
    "production_role_other" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "company_logo_url" "text",
    "company_logo_path" "text",
    "feedback_button_text" "text",
    "last_active_at" timestamp with time zone,
    "inactivity_warning_sent" boolean DEFAULT false,
    "tier_id" "uuid",
    "downgraded_at" timestamp with time zone,
    "storage_reminder_15_sent" boolean DEFAULT false,
    "storage_reminder_1_sent" boolean DEFAULT false
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rack_equipment_instances" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "rack_id" "uuid",
    "template_id" "uuid",
    "ru_position" integer NOT NULL,
    "instance_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "rack_side" "text",
    "ip_address" "text",
    "x_pos" integer,
    "y_pos" integer,
    "page_number" integer,
    "module_assignments" "jsonb" DEFAULT '{}'::"jsonb",
    "parent_item_id" "uuid",
    "parent_slot_id" "text",
    "signal_label" "text",
    "parent_equipment_instance_id" "uuid"
);


ALTER TABLE "public"."rack_equipment_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."racks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "rack_name" "text" NOT NULL,
    "ru_height" integer NOT NULL,
    "saved_to_library" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "show_id" bigint
);


ALTER TABLE "public"."racks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roster" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "phone_number" "text",
    "email" "text",
    "position" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tags" "text"[] DEFAULT '{}'::"text"[]
);


ALTER TABLE "public"."roster" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sender_identities" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "sender_login_email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "app_password" "text"
);


ALTER TABLE "public"."sender_identities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."show_collaborators" (
    "id" bigint NOT NULL,
    "show_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL
);


ALTER TABLE "public"."show_collaborators" OWNER TO "postgres";


ALTER TABLE "public"."show_collaborators" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."show_collaborators_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."show_crew" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "show_id" bigint NOT NULL,
    "roster_id" "uuid" NOT NULL,
    "role" "text",
    "hourly_rate" numeric(8,2),
    "daily_rate" numeric(8,2),
    "rate_type" "text" DEFAULT 'hourly'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "position" "text"
);


ALTER TABLE "public"."show_crew" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shows" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" NOT NULL,
    "data" "jsonb",
    "user_id" "uuid",
    "show_td" "text",
    "show_pm_name" "text",
    "show_pm_email" "text",
    "show_td_name" "text",
    "show_td_email" "text",
    "show_designer_name" "text",
    "show_designer_email" "text",
    "pay_period_start_day" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text"
);


ALTER TABLE "public"."shows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shows_duplicate" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" NOT NULL,
    "data" "jsonb",
    "user_id" "uuid",
    "show_td" "text",
    "show_pm_name" "text",
    "show_pm_email" "text",
    "show_td_name" "text",
    "show_td_email" "text",
    "show_designer_name" "text",
    "show_designer_email" "text",
    "pay_period_start_day" integer DEFAULT 0
);


ALTER TABLE "public"."shows_duplicate" OWNER TO "postgres";


COMMENT ON TABLE "public"."shows_duplicate" IS 'This is a backup of shows';



ALTER TABLE "public"."shows_duplicate" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."shows_duplicate_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."shows" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."shows_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."sso_configs" (
    "id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'authentik'::"text" NOT NULL,
    "config" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sso_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."switch_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rack_item_id" "uuid" NOT NULL,
    "show_id" bigint NOT NULL,
    "port_config" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."switch_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."switch_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "manufacturer" "text",
    "model_name" "text" NOT NULL,
    "port_count" integer DEFAULT 0 NOT NULL,
    "netmiko_driver_type" "text" NOT NULL
);


ALTER TABLE "public"."switch_models" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."switch_push_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "show_id" bigint NOT NULL,
    "switch_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "target_ip" "text" NOT NULL,
    "target_credentials" "bytea",
    "result_log" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."switch_push_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "max_collaborators" integer DEFAULT 2,
    "max_active_shows" integer,
    "max_archived_shows" integer
);


ALTER TABLE "public"."tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."timesheet_entries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "show_crew_id" "uuid",
    "date" "date" NOT NULL,
    "hours" numeric(4,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."timesheet_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_entitlements" (
    "user_id" "uuid" NOT NULL,
    "is_founding" boolean DEFAULT false NOT NULL,
    "founding_granted_at" timestamp with time zone,
    "notes" "text",
    "is_beta" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_entitlements" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_entitlements" IS 'Stores special entitlements for users (e.g. founding status).';



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "role" "text" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_roles" IS 'Assigns system-level roles to users (e.g. global_admin).';



CREATE TABLE IF NOT EXISTS "public"."user_smtp_settings" (
    "user_id" "uuid" NOT NULL,
    "from_name" "text",
    "from_email" "text",
    "smtp_server" "text",
    "smtp_port" integer,
    "smtp_username" "text",
    "encrypted_smtp_password" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_smtp_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vlans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "show_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "tag" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vlans" OWNER TO "postgres";


ALTER TABLE ONLY "public"."agent_api_keys"
    ADD CONSTRAINT "agent_api_keys_key_hash_key" UNIQUE ("key_hash");



ALTER TABLE ONLY "public"."agent_api_keys"
    ADD CONSTRAINT "agent_api_keys_key_prefix_key" UNIQUE ("key_prefix");



ALTER TABLE ONLY "public"."agent_api_keys"
    ADD CONSTRAINT "agent_api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cables"
    ADD CONSTRAINT "cables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_templates"
    ADD CONSTRAINT "equipment_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_restrictions"
    ADD CONSTRAINT "feature_restrictions_feature_name_key" UNIQUE ("feature_name");



ALTER TABLE ONLY "public"."feature_restrictions"
    ADD CONSTRAINT "feature_restrictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."label_stocks"
    ADD CONSTRAINT "label_stocks_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."label_stocks"
    ADD CONSTRAINT "label_stocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."label_templates"
    ADD CONSTRAINT "label_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."looms"
    ADD CONSTRAINT "looms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."network_ip_entries"
    ADD CONSTRAINT "network_ip_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."panel_equipment_instances"
    ADD CONSTRAINT "panel_equipment_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."panel_equipment_templates"
    ADD CONSTRAINT "panel_equipment_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."panel_folders"
    ADD CONSTRAINT "panel_folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions_meta"
    ADD CONSTRAINT "permissions_meta_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rack_equipment_instances"
    ADD CONSTRAINT "rack_equipment_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."racks"
    ADD CONSTRAINT "racks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roster"
    ADD CONSTRAINT "roster_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sender_identities"
    ADD CONSTRAINT "sender_identities_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."sender_identities"
    ADD CONSTRAINT "sender_identities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."show_collaborators"
    ADD CONSTRAINT "show_collaborators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."show_collaborators"
    ADD CONSTRAINT "show_collaborators_show_id_user_id_key" UNIQUE ("show_id", "user_id");



ALTER TABLE ONLY "public"."show_crew"
    ADD CONSTRAINT "show_crew_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shows_duplicate"
    ADD CONSTRAINT "shows_duplicate_name_user_id_key" UNIQUE ("name", "user_id");



ALTER TABLE ONLY "public"."shows_duplicate"
    ADD CONSTRAINT "shows_duplicate_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shows"
    ADD CONSTRAINT "shows_name_user_id_key" UNIQUE ("name", "user_id");



ALTER TABLE ONLY "public"."shows"
    ADD CONSTRAINT "shows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sso_configs"
    ADD CONSTRAINT "sso_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."switch_configs"
    ADD CONSTRAINT "switch_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."switch_configs"
    ADD CONSTRAINT "switch_configs_rack_item_id_key" UNIQUE ("rack_item_id");



ALTER TABLE ONLY "public"."switch_models"
    ADD CONSTRAINT "switch_models_model_name_key" UNIQUE ("model_name");



ALTER TABLE ONLY "public"."switch_models"
    ADD CONSTRAINT "switch_models_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."switch_push_jobs"
    ADD CONSTRAINT "switch_push_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tiers"
    ADD CONSTRAINT "tiers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."tiers"
    ADD CONSTRAINT "tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."timesheet_entries"
    ADD CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."timesheet_entries"
    ADD CONSTRAINT "timesheet_entries_show_crew_id_date_key" UNIQUE ("show_crew_id", "date");



ALTER TABLE ONLY "public"."user_entitlements"
    ADD CONSTRAINT "user_entitlements_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role");



ALTER TABLE ONLY "public"."user_smtp_settings"
    ADD CONSTRAINT "user_smtp_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_smtp_settings"
    ADD CONSTRAINT "user_smtp_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."vlans"
    ADD CONSTRAINT "vlans_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_log_action_idx" ON "public"."audit_log" USING "btree" ("action");



CREATE INDEX "audit_log_actor_id_idx" ON "public"."audit_log" USING "btree" ("actor_id");



CREATE INDEX "audit_log_target_id_idx" ON "public"."audit_log" USING "btree" ("target_id");



CREATE INDEX "idx_network_ip_entries_entity" ON "public"."network_ip_entries" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_network_ip_entries_ip_address" ON "public"."network_ip_entries" USING "btree" ("ip_address");



CREATE INDEX "idx_network_ip_entries_show_id" ON "public"."network_ip_entries" USING "btree" ("show_id");



CREATE INDEX "idx_network_ip_entries_vlan_id" ON "public"."network_ip_entries" USING "btree" ("vlan_id");



CREATE INDEX "idx_rack_equipment_parent_item_id" ON "public"."rack_equipment_instances" USING "btree" ("parent_item_id");



CREATE INDEX "user_entitlements_user_id_idx" ON "public"."user_entitlements" USING "btree" ("user_id");



CREATE INDEX "user_roles_user_id_idx" ON "public"."user_roles" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "on_show_created" AFTER INSERT ON "public"."shows" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_show"();



CREATE OR REPLACE TRIGGER "update_network_ip_entries_updated_at" BEFORE UPDATE ON "public"."network_ip_entries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_smtp_settings_updated_at" BEFORE UPDATE ON "public"."user_smtp_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."agent_api_keys"
    ADD CONSTRAINT "agent_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."cables"
    ADD CONSTRAINT "cables_loom_id_fkey" FOREIGN KEY ("loom_id") REFERENCES "public"."looms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."equipment_templates"
    ADD CONSTRAINT "equipment_templates_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_templates"
    ADD CONSTRAINT "equipment_templates_switch_model_id_fkey" FOREIGN KEY ("switch_model_id") REFERENCES "public"."switch_models"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_templates"
    ADD CONSTRAINT "equipment_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."label_templates"
    ADD CONSTRAINT "label_templates_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "public"."label_stocks"("id");



ALTER TABLE ONLY "public"."label_templates"
    ADD CONSTRAINT "label_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."looms"
    ADD CONSTRAINT "looms_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."looms"
    ADD CONSTRAINT "looms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."network_ip_entries"
    ADD CONSTRAINT "network_ip_entries_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."panel_equipment_instances"
    ADD CONSTRAINT "panel_equipment_instances_panel_instance_id_fkey" FOREIGN KEY ("panel_instance_id") REFERENCES "public"."rack_equipment_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."panel_equipment_instances"
    ADD CONSTRAINT "panel_equipment_instances_parent_instance_id_fkey" FOREIGN KEY ("parent_instance_id") REFERENCES "public"."panel_equipment_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."panel_equipment_instances"
    ADD CONSTRAINT "panel_equipment_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."panel_equipment_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."panel_equipment_templates"
    ADD CONSTRAINT "panel_equipment_templates_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."panel_folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."panel_equipment_templates"
    ADD CONSTRAINT "panel_equipment_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."panel_folders"
    ADD CONSTRAINT "panel_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."panel_folders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."panel_folders"
    ADD CONSTRAINT "panel_folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."tiers"("id");



ALTER TABLE ONLY "public"."rack_equipment_instances"
    ADD CONSTRAINT "rack_equipment_instances_parent_equipment_instance_id_fkey" FOREIGN KEY ("parent_equipment_instance_id") REFERENCES "public"."rack_equipment_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rack_equipment_instances"
    ADD CONSTRAINT "rack_equipment_instances_parent_item_id_fkey" FOREIGN KEY ("parent_item_id") REFERENCES "public"."rack_equipment_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rack_equipment_instances"
    ADD CONSTRAINT "rack_equipment_instances_rack_id_fkey" FOREIGN KEY ("rack_id") REFERENCES "public"."racks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rack_equipment_instances"
    ADD CONSTRAINT "rack_equipment_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."equipment_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."racks"
    ADD CONSTRAINT "racks_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."racks"
    ADD CONSTRAINT "racks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."roster"
    ADD CONSTRAINT "roster_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."show_collaborators"
    ADD CONSTRAINT "show_collaborators_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."show_collaborators"
    ADD CONSTRAINT "show_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."show_crew"
    ADD CONSTRAINT "show_crew_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "public"."roster"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."show_crew"
    ADD CONSTRAINT "show_crew_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shows_duplicate"
    ADD CONSTRAINT "shows_duplicate_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shows"
    ADD CONSTRAINT "shows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sso_configs"
    ADD CONSTRAINT "sso_configs_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."switch_configs"
    ADD CONSTRAINT "switch_configs_rack_item_id_fkey" FOREIGN KEY ("rack_item_id") REFERENCES "public"."rack_equipment_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."switch_configs"
    ADD CONSTRAINT "switch_configs_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."switch_push_jobs"
    ADD CONSTRAINT "switch_push_jobs_show_id_fkey" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."switch_push_jobs"
    ADD CONSTRAINT "switch_push_jobs_switch_id_fkey" FOREIGN KEY ("switch_id") REFERENCES "public"."switch_configs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."switch_push_jobs"
    ADD CONSTRAINT "switch_push_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."timesheet_entries"
    ADD CONSTRAINT "timesheet_entries_show_crew_id_fkey" FOREIGN KEY ("show_crew_id") REFERENCES "public"."show_crew"("id");



ALTER TABLE ONLY "public"."user_entitlements"
    ADD CONSTRAINT "user_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_smtp_settings"
    ADD CONSTRAINT "user_smtp_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Allow access to cables in visible looms" ON "public"."cables" USING ((EXISTS ( SELECT 1
   FROM "public"."looms" "l"
  WHERE ("l"."id" = "cables"."loom_id"))));



CREATE POLICY "Allow access to equipment on visible racks" ON "public"."rack_equipment_instances" USING ((EXISTS ( SELECT 1
   FROM "public"."racks" "r"
  WHERE ("r"."id" = "rack_equipment_instances"."rack_id"))));



CREATE POLICY "Allow access to show connections" ON "public"."connections" USING ((EXISTS ( SELECT 1
   FROM "public"."shows" "s"
  WHERE (("s"."id" = "connections"."show_id") AND (("s"."user_id" = "auth"."uid"()) OR "public"."is_show_member"("s"."id"))))));



CREATE POLICY "Allow access to show crew" ON "public"."show_crew" USING (((EXISTS ( SELECT 1
   FROM "public"."shows"
  WHERE (("shows"."id" = "show_crew"."show_id") AND ("shows"."user_id" = "auth"."uid"())))) OR "public"."is_show_editor_or_owner"("show_id")));



CREATE POLICY "Allow access to show looms" ON "public"."looms" USING ((("auth"."uid"() = "user_id") OR "public"."is_show_member"("show_id")));



CREATE POLICY "Allow access to show members" ON "public"."racks" USING ((("auth"."uid"() = "user_id") OR "public"."is_show_member"("show_id")));



CREATE POLICY "Allow access to show timesheets" ON "public"."timesheet_entries" USING ((EXISTS ( SELECT 1
   FROM "public"."show_crew" "sc"
  WHERE (("sc"."id" = "timesheet_entries"."show_crew_id") AND ((EXISTS ( SELECT 1
           FROM "public"."shows"
          WHERE (("shows"."id" = "sc"."show_id") AND ("shows"."user_id" = "auth"."uid"())))) OR "public"."is_show_editor_or_owner"("sc"."show_id"))))));



CREATE POLICY "Allow access to show vlans" ON "public"."vlans" USING ((EXISTS ( SELECT 1
   FROM "public"."shows" "s"
  WHERE (("s"."id" = "vlans"."show_id") AND (("s"."user_id" = "auth"."uid"()) OR "public"."is_show_member"("s"."id"))))));



CREATE POLICY "Allow access to user-owned or default equipment" ON "public"."equipment_templates" USING ((("is_default" = true) OR ("auth"."uid"() = "user_id"))) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow access to user-owned or default folders" ON "public"."folders" USING ((("is_default" = true) OR ("auth"."uid"() = "user_id"))) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow admins to delete sender identities" ON "public"."sender_identities" FOR DELETE TO "authenticated" USING (('admin'::"text" = ANY ("public"."get_my_roles"())));



CREATE POLICY "Allow admins to insert sender identities" ON "public"."sender_identities" FOR INSERT TO "authenticated" WITH CHECK (('admin'::"text" = ANY ("public"."get_my_roles"())));



CREATE POLICY "Allow admins to manage entitlements" ON "public"."user_entitlements" USING ("public"."is_global_admin"());



CREATE POLICY "Allow admins to manage feature restrictions" ON "public"."feature_restrictions" TO "authenticated" USING (('admin'::"text" = ANY ("public"."get_my_roles"()))) WITH CHECK (('admin'::"text" = ANY ("public"."get_my_roles"())));



CREATE POLICY "Allow admins to manage roles" ON "public"."roles" TO "authenticated" WITH CHECK (('admin'::"text" = ANY ("public"."get_my_roles"())));



CREATE POLICY "Allow admins to manage user roles" ON "public"."user_roles" USING ("public"."is_global_admin"());



CREATE POLICY "Allow admins to read all sender identities" ON "public"."sender_identities" FOR SELECT TO "authenticated" USING (('admin'::"text" = ANY ("public"."get_my_roles"())));



CREATE POLICY "Allow all authenticated users to read role names" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow all users to read the permissions version" ON "public"."permissions_meta" FOR SELECT USING (true);



CREATE POLICY "Allow authenticated users to read feature restrictions" ON "public"."feature_restrictions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow collaborative read access" ON "public"."shows" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."show_collaborators"
  WHERE (("show_collaborators"."show_id" = "shows"."id") AND ("show_collaborators"."user_id" = "auth"."uid"())))));



CREATE POLICY "Allow collaborative read access on Notes" ON "public"."notes" FOR SELECT USING (((("show_id" IS NULL) AND ("auth"."uid"() = "user_id")) OR (EXISTS ( SELECT 1
   FROM "public"."show_collaborators"
  WHERE (("show_collaborators"."show_id" = "notes"."show_id") AND ("show_collaborators"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Allow collaborative update access" ON "public"."shows" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."show_collaborators"
  WHERE (("show_collaborators"."show_id" = "shows"."id") AND ("show_collaborators"."user_id" = "auth"."uid"()) AND (("show_collaborators"."role" = 'owner'::"text") OR ("show_collaborators"."role" = 'editor'::"text"))))));



CREATE POLICY "Allow collaborative write access on Notes" ON "public"."notes" USING (((("show_id" IS NULL) AND ("auth"."uid"() = "user_id")) OR (EXISTS ( SELECT 1
   FROM "public"."show_collaborators"
  WHERE (("show_collaborators"."show_id" = "notes"."show_id") AND ("show_collaborators"."user_id" = "auth"."uid"()) AND (("show_collaborators"."role" = 'owner'::"text") OR ("show_collaborators"."role" = 'editor'::"text"))))))) WITH CHECK (((("show_id" IS NULL) AND ("auth"."uid"() = "user_id")) OR (EXISTS ( SELECT 1
   FROM "public"."show_collaborators"
  WHERE (("show_collaborators"."show_id" = "notes"."show_id") AND ("show_collaborators"."user_id" = "auth"."uid"()) AND (("show_collaborators"."role" = 'owner'::"text") OR ("show_collaborators"."role" = 'editor'::"text")))))));



CREATE POLICY "Allow full access to own SMTP settings" ON "public"."user_smtp_settings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow full access to own roster" ON "public"."roster" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow full access to own show switch configs" ON "public"."switch_configs" USING ((EXISTS ( SELECT 1
   FROM "public"."shows" "s"
  WHERE (("s"."id" = "switch_configs"."show_id") AND ("s"."user_id" = "auth"."uid"())))));



CREATE POLICY "Allow full access to own show switch push jobs" ON "public"."switch_push_jobs" USING ((EXISTS ( SELECT 1
   FROM "public"."shows" "s"
  WHERE (("s"."id" = "switch_push_jobs"."show_id") AND ("s"."user_id" = "auth"."uid"())))));



CREATE POLICY "Allow full access to own shows" ON "public"."shows" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow individual user access to their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Allow individual user to update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Allow insert for authenticated users" ON "public"."shows" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow owner delete access" ON "public"."shows" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."show_collaborators"
  WHERE (("show_collaborators"."show_id" = "shows"."id") AND ("show_collaborators"."user_id" = "auth"."uid"()) AND ("show_collaborators"."role" = 'owner'::"text")))));



CREATE POLICY "Allow read access for all authenticated users" ON "public"."switch_models" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Allow read access to all" ON "public"."label_stocks" FOR SELECT USING (true);



CREATE POLICY "Allow read access to show network IPs" ON "public"."network_ip_entries" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."shows" "s"
  WHERE (("s"."id" = "network_ip_entries"."show_id") AND ("s"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."show_collaborators" "sc"
  WHERE (("sc"."show_id" = "network_ip_entries"."show_id") AND ("sc"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Allow users to delete their own equipment templates" ON "public"."equipment_templates" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to delete their own folders" ON "public"."folders" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to insert their own equipment templates" ON "public"."equipment_templates" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("is_default" = false)));



CREATE POLICY "Allow users to insert their own folders" ON "public"."folders" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND ("is_default" = false)));



CREATE POLICY "Allow users to manage their own API keys" ON "public"."agent_api_keys" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to manage their own equipment templates" ON "public"."equipment_templates" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to manage their own library folders" ON "public"."folders" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to read default equipment templates" ON "public"."equipment_templates" FOR SELECT USING (("is_default" = true));



CREATE POLICY "Allow users to read default library folders" ON "public"."folders" FOR SELECT USING (("is_default" = true));



CREATE POLICY "Allow users to see their own entitlements" ON "public"."user_entitlements" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to see their own roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to update their own equipment templates" ON "public"."equipment_templates" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to update their own folders" ON "public"."folders" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow users to view equipment templates" ON "public"."equipment_templates" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_default" = true)));



CREATE POLICY "Allow users to view folders" ON "public"."folders" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_default" = true)));



CREATE POLICY "Allow viewing of custom templates used in shared shows" ON "public"."equipment_templates" FOR SELECT USING ((("is_default" = true) OR ("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM ("public"."rack_equipment_instances" "rei"
     JOIN "public"."racks" "r" ON (("rei"."rack_id" = "r"."id")))
  WHERE (("rei"."template_id" = "equipment_templates"."id") AND (("r"."user_id" = "auth"."uid"()) OR "public"."is_show_member"("r"."show_id")))))));



CREATE POLICY "Allow viewing roster members on shared shows" ON "public"."roster" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."show_crew" "sc"
  WHERE (("sc"."roster_id" = "roster"."id") AND ((EXISTS ( SELECT 1
           FROM "public"."shows"
          WHERE (("shows"."id" = "sc"."show_id") AND ("shows"."user_id" = "auth"."uid"())))) OR "public"."is_show_editor_or_owner"("sc"."show_id")))))));



CREATE POLICY "Allow write access to show network IPs" ON "public"."network_ip_entries" USING (((EXISTS ( SELECT 1
   FROM "public"."shows" "s"
  WHERE (("s"."id" = "network_ip_entries"."show_id") AND ("s"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."show_collaborators" "sc"
  WHERE (("sc"."show_id" = "network_ip_entries"."show_id") AND ("sc"."user_id" = "auth"."uid"()) AND ("sc"."role" = ANY (ARRAY['owner'::"text", 'editor'::"text"])))))));



CREATE POLICY "Manage Folders" ON "public"."panel_folders" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Manage Instances" ON "public"."panel_equipment_instances" USING ((EXISTS ( SELECT 1
   FROM (("public"."rack_equipment_instances" "rei"
     JOIN "public"."racks" "r" ON (("r"."id" = "rei"."rack_id")))
     JOIN "public"."show_collaborators" "sc" ON (("sc"."show_id" = "r"."show_id")))
  WHERE (("rei"."id" = "panel_equipment_instances"."panel_instance_id") AND ("sc"."user_id" = "auth"."uid"()) AND ("sc"."role" = ANY (ARRAY['owner'::"text", 'editor'::"text"]))))));



CREATE POLICY "Manage Templates" ON "public"."panel_equipment_templates" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Manage collaborators" ON "public"."show_collaborators" USING ("public"."is_show_owner"("show_id"));



CREATE POLICY "Select Folders" ON "public"."panel_folders" FOR SELECT USING ((("is_default" = true) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Select Instances" ON "public"."panel_equipment_instances" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."rack_equipment_instances" "rei"
     JOIN "public"."racks" "r" ON (("r"."id" = "rei"."rack_id")))
     JOIN "public"."show_collaborators" "sc" ON (("sc"."show_id" = "r"."show_id")))
  WHERE (("rei"."id" = "panel_equipment_instances"."panel_instance_id") AND ("sc"."user_id" = "auth"."uid"())))));



CREATE POLICY "Select Templates" ON "public"."panel_equipment_templates" FOR SELECT USING ((("is_default" = true) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Self leave" ON "public"."show_collaborators" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create their own SSO config" ON "public"."sso_configs" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can manage their own equipment templates" ON "public"."equipment_templates" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own racks" ON "public"."racks" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own templates" ON "public"."email_templates" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own SSO config" ON "public"."sso_configs" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view standard library equipment" ON "public"."equipment_templates" FOR SELECT USING (("user_id" IS NULL));



CREATE POLICY "Users can view their own SSO config" ON "public"."sso_configs" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users manage own templates" ON "public"."label_templates" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users view own or public templates" ON "public"."label_templates" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_public" = true)));



CREATE POLICY "View collaborators" ON "public"."show_collaborators" FOR SELECT USING (("public"."is_show_owner"("show_id") OR ("user_id" = "auth"."uid"()) OR "public"."is_show_member"("show_id")));



ALTER TABLE "public"."agent_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_restrictions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."label_stocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."label_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."looms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."network_ip_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."panel_equipment_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."panel_equipment_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."panel_folders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions_meta" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rack_equipment_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."racks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roster" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sender_identities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."show_collaborators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."show_crew" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shows_duplicate" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sso_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."switch_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."switch_models" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."switch_push_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."timesheet_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_entitlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_smtp_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vlans" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."add_constraint_if_not_exists"("t_name" "text", "c_name" "text", "c_def" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_constraint_if_not_exists"("t_name" "text", "c_name" "text", "c_def" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_constraint_if_not_exists"("t_name" "text", "c_name" "text", "c_def" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_access_logo"("_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_logo"("_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_logo"("_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_configurable_switches_for_show"("p_show_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."get_configurable_switches_for_show"("p_show_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_configurable_switches_for_show"("p_show_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_most_used_equipment"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_most_used_equipment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_most_used_equipment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_show"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_show"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_show"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_permissions_version"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_permissions_version"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_permissions_version"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_global_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_global_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_global_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_show_editor_or_owner"("_show_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."is_show_editor_or_owner"("_show_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_show_editor_or_owner"("_show_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_show_member"("_show_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."is_show_member"("_show_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_show_member"("_show_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_show_owner"("_show_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."is_show_owner"("_show_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_show_owner"("_show_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."suspend_user_by_id"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."suspend_user_by_id"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."suspend_user_by_id"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."unsuspend_user_by_id"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unsuspend_user_by_id"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unsuspend_user_by_id"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."agent_api_keys" TO "anon";
GRANT ALL ON TABLE "public"."agent_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_api_keys" TO "service_role";
GRANT ALL ON TABLE "public"."agent_api_keys" TO "supabase_admin";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";
GRANT ALL ON TABLE "public"."audit_log" TO "supabase_admin";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cables" TO "anon";
GRANT ALL ON TABLE "public"."cables" TO "authenticated";
GRANT ALL ON TABLE "public"."cables" TO "service_role";
GRANT ALL ON TABLE "public"."cables" TO "supabase_admin";



GRANT ALL ON TABLE "public"."connections" TO "anon";
GRANT ALL ON TABLE "public"."connections" TO "authenticated";
GRANT ALL ON TABLE "public"."connections" TO "service_role";
GRANT ALL ON TABLE "public"."connections" TO "supabase_admin";



GRANT ALL ON TABLE "public"."email_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_templates" TO "service_role";
GRANT ALL ON TABLE "public"."email_templates" TO "supabase_admin";



GRANT ALL ON TABLE "public"."equipment_templates" TO "anon";
GRANT ALL ON TABLE "public"."equipment_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_templates" TO "service_role";
GRANT ALL ON TABLE "public"."equipment_templates" TO "supabase_admin";



GRANT ALL ON TABLE "public"."feature_restrictions" TO "anon";
GRANT ALL ON TABLE "public"."feature_restrictions" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_restrictions" TO "service_role";
GRANT ALL ON TABLE "public"."feature_restrictions" TO "supabase_admin";



GRANT ALL ON TABLE "public"."folders" TO "anon";
GRANT ALL ON TABLE "public"."folders" TO "authenticated";
GRANT ALL ON TABLE "public"."folders" TO "service_role";
GRANT ALL ON TABLE "public"."folders" TO "supabase_admin";



GRANT ALL ON TABLE "public"."label_stocks" TO "anon";
GRANT ALL ON TABLE "public"."label_stocks" TO "authenticated";
GRANT ALL ON TABLE "public"."label_stocks" TO "service_role";



GRANT ALL ON TABLE "public"."label_templates" TO "anon";
GRANT ALL ON TABLE "public"."label_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."label_templates" TO "service_role";



GRANT ALL ON TABLE "public"."looms" TO "anon";
GRANT ALL ON TABLE "public"."looms" TO "authenticated";
GRANT ALL ON TABLE "public"."looms" TO "service_role";
GRANT ALL ON TABLE "public"."looms" TO "supabase_admin";



GRANT ALL ON TABLE "public"."network_ip_entries" TO "anon";
GRANT ALL ON TABLE "public"."network_ip_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."network_ip_entries" TO "service_role";



GRANT ALL ON TABLE "public"."notes" TO "anon";
GRANT ALL ON TABLE "public"."notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notes" TO "service_role";
GRANT ALL ON TABLE "public"."notes" TO "supabase_admin";



GRANT ALL ON TABLE "public"."panel_equipment_instances" TO "anon";
GRANT ALL ON TABLE "public"."panel_equipment_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."panel_equipment_instances" TO "service_role";



GRANT ALL ON TABLE "public"."panel_equipment_templates" TO "anon";
GRANT ALL ON TABLE "public"."panel_equipment_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."panel_equipment_templates" TO "service_role";



GRANT ALL ON TABLE "public"."panel_folders" TO "anon";
GRANT ALL ON TABLE "public"."panel_folders" TO "authenticated";
GRANT ALL ON TABLE "public"."panel_folders" TO "service_role";



GRANT ALL ON TABLE "public"."permissions_meta" TO "anon";
GRANT ALL ON TABLE "public"."permissions_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions_meta" TO "service_role";
GRANT ALL ON TABLE "public"."permissions_meta" TO "supabase_admin";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT ALL ON TABLE "public"."profiles" TO "supabase_admin";



GRANT ALL ON TABLE "public"."rack_equipment_instances" TO "anon";
GRANT ALL ON TABLE "public"."rack_equipment_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."rack_equipment_instances" TO "service_role";
GRANT ALL ON TABLE "public"."rack_equipment_instances" TO "supabase_admin";



GRANT ALL ON TABLE "public"."racks" TO "anon";
GRANT ALL ON TABLE "public"."racks" TO "authenticated";
GRANT ALL ON TABLE "public"."racks" TO "service_role";
GRANT ALL ON TABLE "public"."racks" TO "supabase_admin";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";
GRANT ALL ON TABLE "public"."roles" TO "supabase_admin";



GRANT ALL ON TABLE "public"."roster" TO "anon";
GRANT ALL ON TABLE "public"."roster" TO "authenticated";
GRANT ALL ON TABLE "public"."roster" TO "service_role";
GRANT ALL ON TABLE "public"."roster" TO "supabase_admin";



GRANT ALL ON TABLE "public"."sender_identities" TO "anon";
GRANT ALL ON TABLE "public"."sender_identities" TO "authenticated";
GRANT ALL ON TABLE "public"."sender_identities" TO "service_role";
GRANT ALL ON TABLE "public"."sender_identities" TO "supabase_admin";



GRANT ALL ON TABLE "public"."show_collaborators" TO "anon";
GRANT ALL ON TABLE "public"."show_collaborators" TO "authenticated";
GRANT ALL ON TABLE "public"."show_collaborators" TO "service_role";
GRANT ALL ON TABLE "public"."show_collaborators" TO "supabase_admin";



GRANT ALL ON SEQUENCE "public"."show_collaborators_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."show_collaborators_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."show_collaborators_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."show_crew" TO "anon";
GRANT ALL ON TABLE "public"."show_crew" TO "authenticated";
GRANT ALL ON TABLE "public"."show_crew" TO "service_role";
GRANT ALL ON TABLE "public"."show_crew" TO "supabase_admin";



GRANT ALL ON TABLE "public"."shows" TO "anon";
GRANT ALL ON TABLE "public"."shows" TO "authenticated";
GRANT ALL ON TABLE "public"."shows" TO "service_role";
GRANT ALL ON TABLE "public"."shows" TO "supabase_admin";



GRANT ALL ON TABLE "public"."shows_duplicate" TO "anon";
GRANT ALL ON TABLE "public"."shows_duplicate" TO "authenticated";
GRANT ALL ON TABLE "public"."shows_duplicate" TO "service_role";
GRANT ALL ON TABLE "public"."shows_duplicate" TO "supabase_admin";



GRANT ALL ON SEQUENCE "public"."shows_duplicate_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shows_duplicate_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shows_duplicate_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."shows_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."shows_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."shows_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."sso_configs" TO "anon";
GRANT ALL ON TABLE "public"."sso_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."sso_configs" TO "service_role";
GRANT ALL ON TABLE "public"."sso_configs" TO "supabase_admin";



GRANT ALL ON TABLE "public"."switch_configs" TO "anon";
GRANT ALL ON TABLE "public"."switch_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."switch_configs" TO "service_role";
GRANT ALL ON TABLE "public"."switch_configs" TO "supabase_admin";



GRANT ALL ON TABLE "public"."switch_models" TO "anon";
GRANT ALL ON TABLE "public"."switch_models" TO "authenticated";
GRANT ALL ON TABLE "public"."switch_models" TO "service_role";
GRANT ALL ON TABLE "public"."switch_models" TO "supabase_admin";



GRANT ALL ON TABLE "public"."switch_push_jobs" TO "anon";
GRANT ALL ON TABLE "public"."switch_push_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."switch_push_jobs" TO "service_role";
GRANT ALL ON TABLE "public"."switch_push_jobs" TO "supabase_admin";



GRANT ALL ON TABLE "public"."tiers" TO "anon";
GRANT ALL ON TABLE "public"."tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."tiers" TO "service_role";



GRANT ALL ON TABLE "public"."timesheet_entries" TO "anon";
GRANT ALL ON TABLE "public"."timesheet_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."timesheet_entries" TO "service_role";
GRANT ALL ON TABLE "public"."timesheet_entries" TO "supabase_admin";



GRANT ALL ON TABLE "public"."user_entitlements" TO "anon";
GRANT ALL ON TABLE "public"."user_entitlements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_entitlements" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";
GRANT ALL ON TABLE "public"."user_roles" TO "supabase_admin";



GRANT ALL ON TABLE "public"."user_smtp_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_smtp_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_smtp_settings" TO "service_role";
GRANT ALL ON TABLE "public"."user_smtp_settings" TO "supabase_admin";



GRANT ALL ON TABLE "public"."vlans" TO "anon";
GRANT ALL ON TABLE "public"."vlans" TO "authenticated";
GRANT ALL ON TABLE "public"."vlans" TO "service_role";
GRANT ALL ON TABLE "public"."vlans" TO "supabase_admin";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
