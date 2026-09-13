# Overseer Postgres. Base tag is pinned here so one file names the version.
#
# Adds CREATE DATABASE labkit via initdb/, nothing else. AGE comes from the
# base image (`shared_preload_libraries=age`, plus its own
# 00-create-extension-age.sql). Extensions, roles, and schema are LabKit
# migrations.
FROM apache/age:release_PG18_1.7.0

COPY initdb/ /docker-entrypoint-initdb.d/
