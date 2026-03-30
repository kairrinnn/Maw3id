# Salon Bot Maroc

## What This Is

Plateforme SaaS multi-tenant qui connecte un bot WhatsApp intelligent à chaque salon
de coiffure/beauté au Maroc. Le bot gère les réservations, modifications, annulations
et rappels automatiques via WhatsApp — sans intervention humaine. Chaque salon dispose
d'un dashboard admin personnalisé et d'une configuration métier propre.

## Core Value

Un client peut réserver un créneau au salon à n'importe quelle heure, et le salon ne
rate plus aucun rendez-vous faute de réponse manuelle.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Bot WhatsApp répond 24/7 aux clients et gère les réservations de A à Z
- [ ] Multi-tenant : chaque salon a son propre numéro, config, prompt et données isolées
- [ ] Dashboard admin par salon : historique RDV, config services/horaires, stats
- [ ] LLM routing : intent simple → modèle cheap, cas ambigus → meilleur modèle
- [ ] State structuré par conversation (pas d'historique brut) pour contrôle des coûts IA
- [ ] Rappels automatiques via templates Meta WhatsApp pré-approuvés
- [ ] Onboarding salon en 2 phases : config dashboard → go-live Meta validé
- [ ] Offres commerciales : Starter / Booking AI / Pro (setup fee + mensuel)

### Out of Scope

- Campagnes marketing WhatsApp — coûts templates élevés, réservé v2
- App mobile native — web dashboard suffit pour v1
- Prise en charge multi-langue (arabe dialectal) — français/darija simple pour v1
- Intégration caisse / paiement en ligne — hors scope bot de réservation

## Context

**Marché :** Salons au Maroc, segment PME/TPE, sensibles au prix. Majorité des
interactions se font déjà via WhatsApp informel. Le bot remplace le "WhatsApp manuel"
qu'ils gèrent aujourd'hui.

**Modèle commercial validé par analyse :**
- Setup : 1 500 à 5 000 MAD selon offre
- Mensuel : 400 à 1 200 MAD/salon
- Coût infra direct estimé : 70 à 200 MAD/mois/salon si bien mutualisé
- Marges confortables si volume (10+ salons)

**Numéro WhatsApp :**
- Option 1 : salon garde son numéro (coexistence Meta si éligible)
- Option 2 : numéro dédié bot (séparation propre, recommandé pour V1)
- Migration complète = option premium accompagnée

**LLM :**
- Routing : nano/cheap pour intent simple (FAQ, extraction), mini/standard pour cas ambigus
- State structuré : nom, service, date, heure, statut — pas d'historique brut envoyé au modèle
- Fenêtre 24h : messages normaux ; hors fenêtre : templates pré-approuvés

**Friction opérationnelle connue :**
- Approbation Meta : délai variable, onboarding en 2 phases contractualisé
- Templates : soumis dès le jour 1 de l'onboarding (rappel RDV, confirmation, annulation)
- Migration numéro : éligibilité coexistence vérifiée avant vente, sinon numéro dédié

## Constraints

- **Stack** : Next.js 15 + TypeScript, Supabase (Postgres + Auth), Meta WhatsApp Cloud API
- **LLM** : Routing modèle cheap / standard — pas de vendor lock-in sur un seul modèle
- **Budget infra** : Mutualisé, coût /salon bas — pas de déploiement isolé par client
- **Cible V1** : Salons solo à petits (1-5 employés) — architecture extensible pour plus grand
- **Langue** : Interface dashboard en français, bot en français/darija simple

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Meta Cloud API direct (pas Twilio/WATI) | Évite les marges intermédiaires, meilleur contrôle des coûts | — Pending |
| State structuré vs historique brut | Coûts LLM x3-x5 si historique complet envoyé | — Pending |
| Supabase pour multi-tenant | RLS natif, Auth inclus, Postgres familier | — Pending |
| Numéro dédié par défaut en V1 | Évite friction migration, coexistence non garantie universellement | — Pending |
| Templates soumis à J1 onboarding | Rappels hors 24h impossibles sans templates approuvés | — Pending |

---
*Last updated: 2026-03-30 after initialization*
