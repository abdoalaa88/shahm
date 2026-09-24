-- Retire the legacy authenticated trip-creation RPC.
-- The app exclusively creates trips through the validated create-trip-proxy Edge Function.
DROP FUNCTION IF EXISTS public.create_trip(
  text, text, double precision, double precision,
  text, text, double precision, double precision,
  public.requester_relation, inet, timestamptz
);
