-- WA-02: Deduplication table for incoming WhatsApp messages
-- wamid is PRIMARY KEY — INSERT ON CONFLICT DO NOTHING is the dedup mechanism

CREATE TABLE public.processed_messages (
  wamid       TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_processed_messages_tenant_id ON public.processed_messages(tenant_id);
