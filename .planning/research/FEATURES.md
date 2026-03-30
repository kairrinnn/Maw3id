# Features Research: Salon Bot Maroc

**Domain:** WhatsApp appointment booking bot for beauty salons — Morocco market
**Date:** 2026-03-31

---

## Table Stakes (Must Have — salons won't pay without these)

### Booking Flow
- Client can book an appointment via WhatsApp (service + date + time + name)
- Bot confirms booking and sends confirmation message
- Client can modify an existing appointment
- Client can cancel an appointment
- Bot handles "what slots are available?" query

### Reminders
- Automatic reminder 24h before appointment (WhatsApp template)
- Automatic reminder 1-2h before appointment (optional, template)
- Confirmation request after booking ("confirme avec 1 ou 2")

### Salon Configuration
- Admin can define services + durations + prices
- Admin can set working hours + days off
- Admin can block specific time slots
- Admin can view upcoming appointments dashboard

### Bot Behavior
- Bot responds 24/7 (not just business hours)
- Bot handles unknown/unrecognized messages gracefully (fallback to human)
- Bot respects 24h WhatsApp conversation window
- Bot speaks French (+ basic Darija understood)

### Onboarding
- Salon can connect WhatsApp number (dedicated or coexistence)
- Salon can customize bot greeting/prompt
- Templates submitted at onboarding (not reactively)

---

## Differentiators (Competitive Advantage for this market)

### Dashboard
- Real-time appointment list for the day
- Client history (past appointments per phone number)
- No-show tracking
- Revenue stats per period

### Bot Intelligence
- LLM routing: cheap model for simple cases, better model for ambiguous ones
- Handles imprecise inputs ("demain après-midi" → proposes available slots)
- Multi-service booking in one conversation
- Remembers client name across conversations

### Onboarding Experience
- Step-by-step guided setup (not technical)
- Pre-written template library (rappel, confirmation, annulation)
- Test mode before go-live

### Business Model Features
- Salon subscription management visible in dashboard
- Usage stats (messages sent, bookings made)

---

## Anti-Features (Deliberately NOT build in V1)

| Feature | Why Avoid |
|---------|-----------|
| WhatsApp marketing campaigns | High template cost, policy risk, not core value |
| Online payment via bot | Complexity, Moroccan payment gateway integration, v2+ |
| Multi-staff booking (team calendar) | V1 = solo/small salon; add in v2 |
| Native mobile app for admin | Web dashboard sufficient, saves dev time |
| Full Arabic (Fusha) support | Darija ≠ Fusha; better to do French well than Arabic badly |
| Real-time chat between salon and client | Defeats the automation purpose |
| Review/rating system | Out of scope for booking bot |
| Instagram/Facebook booking | Other channels = v2+ |

---

## Morocco Market Specifics

| Factor | Implication |
|--------|-------------|
| WhatsApp is primary communication channel | No resistance to bot onboarding — clients already expect WhatsApp |
| Salons manage bookings manually on WhatsApp today | Bot replaces existing WhatsApp workflow, not a new habit |
| Sensible au prix | Starter tier at 400 MAD/mois must feel "cheap vs hiring a secretary" |
| Darija spoken, French written | Bot responses in French + understands informal Darija input |
| Late cancellations common | Reminder templates + confirmation request = key selling point |
| Owner = manager = sometimes employee | Dashboard must be simple, not enterprise-complex |

---

## Feature Priority Matrix (V1)

| Feature | Priority | Complexity | Value |
|---------|----------|------------|-------|
| Booking flow (book/modify/cancel) | Must | Medium | Very High |
| 24/7 availability | Must | Low | Very High |
| Reminder templates | Must | Medium | High |
| Service/hours config | Must | Low | High |
| Day view dashboard | Must | Low | High |
| LLM routing | Should | Medium | Medium |
| Client history | Should | Low | Medium |
| Stats/revenue | Could | Low | Medium |
| Multi-staff | Won't V1 | High | Low |
| Payments | Won't V1 | Very High | Low |

---

*Written: 2026-03-31*
