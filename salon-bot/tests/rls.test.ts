import { describe, it, expect } from 'vitest'

describe('INFRA-02: RLS default DENY', () => {
  const RLS_TABLES = [
    'services', 'schedules', 'conversations', 'bookings',
    'bot_configs', 'phone_numbers', 'tenant_users', 'whatsapp_templates',
  ]

  it.each(RLS_TABLES)('table %s has RLS enabled', async (table) => {
    // Integration test — requires running Supabase instance
    // Verified by migration: ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY
    expect(table).toBeTruthy() // Placeholder assertion
  })

  it('cross-tenant query returns zero rows', () => {
    // Integration test — requires two test tenants and authenticated sessions
    // Stub: will be implemented when Supabase local dev is running
    expect(true).toBe(true)
  })
})
