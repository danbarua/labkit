FROM apache/age:release_PG18_1.7.0

# Sorts after the base image's own 00-create-extension-age.sql.
COPY initdb/ /docker-entrypoint-initdb.d/
