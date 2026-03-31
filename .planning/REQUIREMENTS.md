# Requirements: Salon Bot Maroc

**Defined:** 2026-03-31
**Core Value:** Un client peut réserver un créneau au salon à n'importe quelle heure, et le salon ne rate plus aucun rendez-vous faute de réponse manuelle.

## v1 Requirements

### Infrastructure & Multi-Tenant

- [x] **INFRA-01**: Schéma Postgres multi-tenant avec `tenant_id` indexé sur toutes les tables (tenants, bookings, services, conversations, templates)
- [x] **INFRA-02**: RLS Supabase activé par défaut DENY — chaque salon ne peut lire/écrire que ses propres données
- [ ] **INFRA-03**: Salon owner peut créer un compte et se connecter au dashboard (Supabase Auth email/password)
- [x] **INFRA-04**: Chaque salon a une configuration bot propre (prompt système, services, horaires, statut actif/inactif)
- [ ] **INFRA-05**: Webhook router identifie le tenant à partir du `phone_number_id` Meta et route le message vers la bonne config

### WhatsApp Integration

- [ ] **WA-01**: Endpoint webhook GET retourne `hub.challenge` si `hub.verify_token` correspond (Meta verification)
- [ ] **WA-02**: Endpoint webhook POST traite les messages entrants avec déduplication via `wamid` (unique constraint DB)
- [ ] **WA-03**: Bot peut envoyer des messages texte et des templates WhatsApp via Meta Cloud API
- [ ] **WA-04**: Admin peut connecter un numéro WhatsApp au salon (option numéro dédié ou coexistence)

### Bot / LLM Engine

- [ ] **BOT-01**: Chaque conversation a un state structuré persisté en DB (`step`, `service_id`, `date`, `time`, `client_name`, `phone`, `status`)
- [ ] **BOT-02**: Routing LLM : modèle cheap (Gemini Flash / gpt-4o-mini) pour extraction simple, meilleur modèle pour cas ambigus ou échecs
- [ ] **BOT-03**: Bot répond avec un message de fallback gracieux pour les inputs non reconnus

### Booking Core

- [ ] **BOOK-01**: Client peut réserver un RDV en choisissant service + date + heure via WhatsApp
- [ ] **BOOK-02**: Client peut modifier la date/heure d'un RDV confirmé
- [ ] **BOOK-03**: Client peut annuler un RDV confirmé
- [ ] **BOOK-04**: Client peut consulter ses RDV à venir en tapant un mot-clé ("mes rdv", "prochain rdv")
- [ ] **BOOK-05**: Double booking impossible — contrainte unique DB sur `(tenant_id, datetime)` avec Postgres locking
- [ ] **BOOK-06**: Confirmation immédiate envoyée au client après réservation confirmée (résumé service + date + heure)
- [ ] **BOOK-07**: Notification envoyée au gérant (WhatsApp ou dashboard) quand un client annule

### Templates & Rappels

- [ ] **TPL-01**: 3 templates standard (rappel RDV, confirmation, annulation) soumis à Meta à J1 de l'onboarding
- [ ] **TPL-02**: Rappel automatique 24h avant RDV envoyé via template Meta approuvé

### Dashboard Admin

- [ ] **DASH-01**: Gérant peut créer/modifier/supprimer les services (nom, durée, prix)
- [ ] **DASH-02**: Gérant peut définir les horaires d'ouverture et les jours de fermeture
- [ ] **DASH-03**: Dashboard affiche les stats simples : nombre de bookings et revenus estimés par période (semaine/mois)

### Onboarding Salon

- [ ] **ONB-01**: Formulaire guidé de setup initial du salon (nom, description, services, horaires)
- [ ] **ONB-02**: Étape de connexion numéro WhatsApp avec choix : numéro dédié ou coexistence
- [ ] **ONB-03**: Mode test activable avant go-live (bot actif en sandbox sur numéro test)

### Offres & Facturation

- [ ] **BIZ-01**: Chaque salon a un enregistrement d'abonnement (plan, date début, statut: active/expired/trial)
- [ ] **BIZ-02**: Bot se désactive automatiquement si abonnement expiré (webhook check `tenant.is_active`)
- [ ] **BIZ-03**: Facturation automatisée via Stripe (création subscription, webhooks paiement, portail client)

---

## v2 Requirements

### Reminders Avancés
- **TPL-V2-01**: Rappel 2h avant RDV (template Meta optionnel)
- **TPL-V2-02**: Campagnes de relance clients inactifs (marketing templates)

### Dashboard Étendu
- **DASH-V2-01**: Planning jour/semaine visuel (vue calendrier)
- **DASH-V2-02**: Historique complet par client (tous RDV passés d'un numéro)
- **DASH-V2-03**: Export CSV des réservations

### Bot Avancé
- **BOT-V2-01**: Booking multi-services en une conversation
- **BOT-V2-02**: Mémoire client entre conversations (nom mémorisé au retour)
- **BOT-V2-03**: Support Darija amélioré (fine-tuning ou few-shot)

### Multi-Staff
- **STAFF-V2-01**: Plusieurs employés par salon avec agendas séparés
- **STAFF-V2-02**: Client peut choisir un prestataire spécifique

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Paiement en ligne via bot | Intégration passerelle marocaine (CMI/PayZone) complexe, v3+ |
| App mobile native admin | Web dashboard suffisant pour V1 |
| Campagnes marketing WhatsApp | Risque policy Meta + coût templates, v2 |
| Intégration caisse / POS | Hors périmètre bot de réservation |
| Instagram / Facebook booking | Multi-canal = v2+ |
| Système d'avis / notation | Hors scope V1 |
| Arabic Fusha | Darija ≠ Fusha — français suffit pour V1 |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 2 | Pending |
| WA-01 | Phase 2 | Pending |
| WA-02 | Phase 2 | Pending |
| WA-03 | Phase 2 | Pending |
| WA-04 | Phase 7 | Pending |
| BOT-01 | Phase 3 | Pending |
| BOT-02 | Phase 3 | Pending |
| BOT-03 | Phase 3 | Pending |
| BOOK-01 | Phase 4 | Pending |
| BOOK-02 | Phase 4 | Pending |
| BOOK-03 | Phase 4 | Pending |
| BOOK-04 | Phase 4 | Pending |
| BOOK-05 | Phase 4 | Pending |
| BOOK-06 | Phase 4 | Pending |
| BOOK-07 | Phase 4 | Pending |
| TPL-01 | Phase 5 | Pending |
| TPL-02 | Phase 5 | Pending |
| DASH-01 | Phase 6 | Pending |
| DASH-02 | Phase 6 | Pending |
| DASH-03 | Phase 6 | Pending |
| ONB-01 | Phase 7 | Pending |
| ONB-02 | Phase 7 | Pending |
| ONB-03 | Phase 7 | Pending |
| BIZ-01 | Phase 8 | Pending |
| BIZ-02 | Phase 8 | Pending |
| BIZ-03 | Phase 8 | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-31*
*Last updated: 2026-03-31 after initial definition*
