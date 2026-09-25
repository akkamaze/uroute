\set ON_ERROR_STOP on
\getenv app_user APP_DB_USER
\getenv app_password APP_DB_PASSWORD
\getenv app_db APP_DB_NAME

SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') \gexec

SELECT format('ALTER ROLE %I PASSWORD %L', :'app_user', :'app_password') \gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'app_db', :'app_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'app_db') \gexec

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'app_db') \gexec
