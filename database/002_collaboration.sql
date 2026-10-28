-- Import once AFTER 001_initial.sql into the same database.
ALTER TABLE gf_users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0;

-- Persistent throttling survives cookie changes. Keys contain hashes, not emails/IPs.
CREATE TABLE gf_auth_limits (
    bucket CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    window_started DATETIME NOT NULL,
    PRIMARY KEY (bucket)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO gf_schema_migrations (version) VALUES ('002_collaboration');
