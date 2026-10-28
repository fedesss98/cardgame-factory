-- Game Factory: proposed initial collaboration database.
-- Target: Hostinger MariaDB 11.8.9, InnoDB, utf8mb4.
-- Reviewed against MariaDB documentation; execution on the host is still pending.
-- Import ONCE into a new, empty database selected in phpMyAdmin.
-- No credentials, default users, database creation or destructive resets.
-- MySQL DDL commits implicitly: on failure inspect the partial import before retrying.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE gf_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(254) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    disabled_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_gf_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gf_projects (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(120) NOT NULL,
    current_revision BIGINT UNSIGNED NULL,
    archived_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_gf_project_owner (owner_user_id, archived_at),
    CONSTRAINT fk_gf_project_owner FOREIGN KEY (owner_user_id) REFERENCES gf_users (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The owner is determined by gf_projects.owner_user_id, not a duplicated role.
-- Other users can be editors or viewers. Roles are enforced by the PHP API.
CREATE TABLE gf_project_members (
    project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    role ENUM('editor', 'viewer') NOT NULL,
    added_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (project_id, user_id),
    KEY ix_gf_member_user (user_id, project_id),
    CONSTRAINT fk_gf_member_project FOREIGN KEY (project_id) REFERENCES gf_projects (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_gf_member_user FOREIGN KEY (user_id) REFERENCES gf_users (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_gf_member_added_by FOREIGN KEY (added_by) REFERENCES gf_users (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each save is an immutable, validated game.json snapshot.
-- revision is a collaboration counter, separate from game contentVersion/versionCode.
CREATE TABLE gf_project_revisions (
    project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    revision BIGINT UNSIGNED NOT NULL,
    game_schema_version VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    game_document JSON NOT NULL,
    document_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    saved_by BIGINT UNSIGNED NOT NULL,
    note VARCHAR(500) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (project_id, revision),
    KEY ix_gf_revision_author (saved_by),
    CONSTRAINT fk_gf_revision_project FOREIGN KEY (project_id) REFERENCES gf_projects (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_gf_revision_author FOREIGN KEY (saved_by) REFERENCES gf_users (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Prevent a project from pointing at another project's revision.
ALTER TABLE gf_projects
    ADD CONSTRAINT fk_gf_project_head FOREIGN KEY (id, current_revision)
    REFERENCES gf_project_revisions (project_id, revision)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Files are immutable and stored privately on disk, not as database blobs.
CREATE TABLE gf_assets (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    storage_key VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    byte_size BIGINT UNSIGNED NOT NULL,
    sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    uploaded_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_gf_asset_storage (storage_key),
    UNIQUE KEY uq_gf_asset_project_id (project_id, id),
    KEY ix_gf_asset_hash (project_id, sha256),
    CONSTRAINT fk_gf_asset_project FOREIGN KEY (project_id) REFERENCES gf_projects (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_gf_asset_uploader FOREIGN KEY (uploaded_by) REFERENCES gf_users (id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Map game.json logical asset IDs to exact stored bytes for each revision.
CREATE TABLE gf_revision_assets (
    project_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    revision BIGINT UNSIGNED NOT NULL,
    logical_asset_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (project_id, revision, logical_asset_id),
    KEY ix_gf_revision_asset_file (project_id, asset_id),
    CONSTRAINT fk_gf_revision_asset_revision FOREIGN KEY (project_id, revision)
        REFERENCES gf_project_revisions (project_id, revision)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_gf_revision_asset_file FOREIGN KEY (project_id, asset_id)
        REFERENCES gf_assets (project_id, id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gf_schema_migrations (
    version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO gf_schema_migrations (version) VALUES ('001_initial');
