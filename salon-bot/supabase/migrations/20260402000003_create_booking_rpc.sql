-- Phase 4: Atomic booking creation with SELECT FOR UPDATE (BOOK-05)
-- Morocco is UTC+1 (no DST). All appointment_at values should include +01:00 offset.
-- The caller constructs TIMESTAMPTZ with explicit timezone; this function stores as-is.

CREATE OR REPLACE FUNCTION public.create_booking(
  p_tenant_id       UUID,
  p_service_id      UUID,
  p_staff_id        UUID        DEFAULT NULL,
  p_client_wa_id    TEXT        DEFAULT NULL,
  p_client_name     TEXT        DEFAULT NULL,
  p_conversation_id UUID        DEFAULT NULL,
  p_appointment_at  TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  -- Lock any existing confirmed booking at this slot to prevent race condition
  PERFORM 1
    FROM public.bookings
   WHERE tenant_id = p_tenant_id
     AND appointment_at = p_appointment_at
     AND status = 'confirmed'
     AND (
       (p_staff_id IS NULL AND staff_id IS NULL)
       OR (staff_id = p_staff_id)
     )
   FOR UPDATE;

  -- Insert the new booking — if a confirmed row already exists at this slot,
  -- the partial unique index will raise 23505 (unique_violation)
  INSERT INTO public.bookings (
    tenant_id, service_id, staff_id, client_wa_id, client_name,
    conversation_id, appointment_at, status
  )
  VALUES (
    p_tenant_id, p_service_id, p_staff_id, p_client_wa_id, p_client_name,
    p_conversation_id, p_appointment_at, 'confirmed'
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;
