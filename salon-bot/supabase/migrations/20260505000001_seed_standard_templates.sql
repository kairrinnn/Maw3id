-- Phase 5 / TPL-01: Seed the 3 standard templates for every tenant
-- Idempotent — uses ON CONFLICT (tenant_id, template_name) DO NOTHING per UNIQUE constraint
-- Body text: {{1}} = datetime, {{2}} = salon name (Meta substitutes variables on their end)

INSERT INTO public.whatsapp_templates (tenant_id, template_name, language, body_text, meta_status)
SELECT t.id, 'rdv_reminder', 'fr',
  'Rappel : votre rendez-vous chez {{2}} est prévu le {{1}}. À bientôt !',
  'pending'
FROM public.tenants t
ON CONFLICT (tenant_id, template_name) DO NOTHING;

INSERT INTO public.whatsapp_templates (tenant_id, template_name, language, body_text, meta_status)
SELECT t.id, 'rdv_confirmation', 'fr',
  'Votre rendez-vous chez {{2}} est confirmé pour le {{1}}. Merci !',
  'pending'
FROM public.tenants t
ON CONFLICT (tenant_id, template_name) DO NOTHING;

INSERT INTO public.whatsapp_templates (tenant_id, template_name, language, body_text, meta_status)
SELECT t.id, 'rdv_cancellation', 'fr',
  'Votre rendez-vous chez {{2}} du {{1}} a été annulé. Contactez-nous pour en prendre un nouveau.',
  'pending'
FROM public.tenants t
ON CONFLICT (tenant_id, template_name) DO NOTHING;

-- Trigger function: auto-seed templates for newly created tenants
-- Runs AFTER INSERT on public.tenants so new tenants always get all 3 templates
CREATE OR REPLACE FUNCTION public.seed_tenant_standard_templates()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.whatsapp_templates (tenant_id, template_name, language, body_text, meta_status)
  VALUES
    (NEW.id, 'rdv_reminder', 'fr',
      'Rappel : votre rendez-vous chez {{2}} est prévu le {{1}}. À bientôt !',
      'pending'),
    (NEW.id, 'rdv_confirmation', 'fr',
      'Votre rendez-vous chez {{2}} est confirmé pour le {{1}}. Merci !',
      'pending'),
    (NEW.id, 'rdv_cancellation', 'fr',
      'Votre rendez-vous chez {{2}} du {{1}} a été annulé. Contactez-nous pour en prendre un nouveau.',
      'pending')
  ON CONFLICT (tenant_id, template_name) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_standard_templates ON public.tenants;
CREATE TRIGGER trg_seed_standard_templates
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_tenant_standard_templates();
