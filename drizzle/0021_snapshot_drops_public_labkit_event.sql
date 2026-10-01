-- allow-destructive: a no-op; 0014 drops public.labkit_event. Written by db:generate so that
-- drizzle's snapshot no longer declares the table.
DROP TABLE IF EXISTS public.labkit_event;
