-- Overseer database. Created once on an empty data directory, after the base
-- image's `00-create-extension-age.sql`.
--
-- Do not create `labkit_tests` here. That name belongs to the parent
-- `test:pg` suite, which truncates it.
CREATE DATABASE labkit;
