# Overname Intelligence Scanner — Deep Research Report

> Datum: 2026-03-24
> Status: Research complete, ready for implementation planning
> Auteur: Claude Code (Opus 4.6) — 3 parallel research agents

---

## Executive Summary

De Overname Intelligence Scanner is een **AI-powered marktintelligentie systeem** dat automatisch horecazaken scant in Nederlandse steden, overname-signalen detecteert, en deze matcht tegen zoekprofielen van klanten. Dit wordt de **unique selling point** van Horecagrond — geen enkele concurrent biedt proactieve, data-driven overname-intelligence.

**Kernbelofte**: "Funda toont wat te koop staat. Wij tonen wat binnenkort beschikbaar komt."

**Huidige codebase**: ~70% van de benodigde infrastructuur bestaat al (buurt providers, AI stack, Trigger.dev jobs, matching engine, caching).

---

## 1. HUIDIGE SITUATIE — Wat hebben we al?

### Data Providers (lib/buurt/)
| Provider | Bestand | Wat het levert | Herbruikbaar? |
|----------|---------|----------------|---------------|
| Google Places API v1 | `google-places.ts` | Nearby search, details, reviews, ratings, businessStatus | **Ja** — kernbron voor scanner |
| CBS Demografie | `cbs.ts` | Inwoners, inkomen, leeftijd, dichtheid per buurt | **Ja** — matching criteria |
| BAG/PDOK | `bag.ts` | Bouwjaar, gebruiksdoel, oppervlakte | **Ja** — surface matching |
| Transport/OV | `transport.ts` | Stations, haltes, bereikbaarheidsscore | **Ja** — locatie scoring |
| OpenStreetMap | `osm.ts` | Concurrenten, voorzieningen | **Ja** — competitor density |
| Passanten | `passanten.ts` | Geschatte dagelijkse passanten | **Ja** — footfall matching |

**Orchestratie**: `analyze.ts` draait alle providers parallel via `Promise.allSettled()` met caching per bron.

### AI Stack (lib/ai/)
| Component | Bestand | Pattern |
|-----------|---------|---------|
| Model factory | `model.ts` | Groq (llama-3.3-70b) → OpenAI (gpt-4o-mini) → Ollama fallback |
| AI Agent classifier | `buurt/ai-classifier.ts` | `generateText()` + `tool()` + `stopWhen: stepCountIs()` — **full agentic pattern** |
| Concept checker | `buurt/concept-checker.ts` | Multi-source orchestratie, AI scoring, gap analyse |
| Semantic search | `ai/semantic-search.ts` | `generateObject()` voor NL→structured filter parsing |
| Chat route | `api/chat/route.ts` | `streamText()` + `toUIMessageStreamResponse()` + tools |

### Trigger.dev Jobs (trigger/)
| Job | Bestand | Pattern |
|-----|---------|---------|
| Bulk AI generate | `bulk-ai-generate.ts` | Sequential loop, `metadata.set()` progress, rate limiting, standalone Prisma |
| Video orchestrator | `video-orchestrator.ts` | `batchTriggerAndWait()` voor parallel subtasks, multi-fase pipeline |

### Matching & Alerts
| Component | Bestand | Herbruikbaar? |
|-----------|---------|---------------|
| SearchAlert model | `prisma/schema.prisma` | **Ja** — cities, types, price/surface ranges |
| Alert matcher | `search-alerts/matcher.ts` | **Ja** — property-to-alert matching met tolerantie |
| Cron endpoint | `api/cron/search-alerts/route.ts` | **Ja** — CRON_SECRET auth pattern |
| Email templates | `emails/templates/` | **Ja** — Resend + React Email |

### Wat MIST er?
1. **Geen overname-specifieke data modellen** (MonitoredBusiness, Snapshots, Matches)
2. **Geen signaal-detectie logica** (rating drops, review sentiment, sluitingen)
3. **Geen Google Places "gesloten zaken"** — `google-places.ts` filtert `CLOSED_PERMANENTLY` nu WEG (regel 92) — moet juist INCLUDEREN
4. **Geen historische monitoring** (snapshots over tijd voor trend detection)
5. **Geen KvK/AlleCijfers integratie** voor eigenaar/keten informatie
6. **Geen intelligence dashboard UI**

---

## 2. TECHNISCHE ARCHITECTUUR — Hoe bouwen we het?

### AI Agentic Pipeline (AI SDK 6)

**Geen aparte Agent class nodig** — het project gebruikt al het juiste pattern in `ai-classifier.ts`:

```
generateText({
  model: getModel(),
  tools: { ... },
  stopWhen: stepCountIs(N),
  system: "...",
  prompt: "..."
})
```

Dit is de correcte AI SDK 6 aanpak. De scanner gebruikt 3 AI-patronen:

| Stap | AI Pattern | Model | Waarom |
|------|-----------|-------|--------|
| Business classificatie | `generateObject()` + Zod schema | Groq llama-3.3-70b | Gestructureerde output, batch van 20 |
| Signaal detectie | `generateText()` + tools + `stopWhen` | Groq llama-3.3-70b | Agent beslist welke reviews te analyseren |
| Match samenvatting | `generateText()` | Groq llama-3.3-70b | Pure tekst generatie met context |

### Trigger.dev Orchestrator Architectuur

Gebaseerd op het bewezen `video-orchestrator.ts` pattern:

```
trigger/intelligence-scan.ts (ORCHESTRATOR)
  maxDuration: 1800s (30 min)

  Fase 1: City Scan
    → trigger/scan-city-places.ts (SUBTASK per stad)
      maxDuration: 300s, retry: 2x
      batchTriggerAndWait() voor parallel scanning
      Rate limit: queue concurrency 2

  Fase 2: AI Classificatie
    → trigger/classify-businesses.ts (SUBTASK per batch van 20)
      maxDuration: 120s, retry: 2x
      generateObject() met Zod schema

  Fase 3: Signaal Detectie
    → trigger/detect-signals.ts (SUBTASK per batch van 10)
      maxDuration: 300s, retry: 2x
      Agentic: review analyse + signaal scoring

  Fase 4: Profile Matching
    → trigger/match-profiles.ts (SUBTASK per profiel)
      maxDuration: 120s
      Deterministische matching + AI samenvatting
```

### Progress Tracking

**Trigger.dev metadata polling** (bewezen in `video-orchestrator.ts`):
- Orchestrator zet `metadata.set("progress", { phase, city, completed, total })`
- UI pollt elke 2-3 sec via server action
- Geen WebSocket/SSE nodig voor een 5-30 min job

### Kosten per Scan

| Bron | Berekening | Kosten |
|------|-----------|--------|
| Google Places Nearby | ~10 steden x 3 types = 30 calls | $0.96 |
| Google Places Details | ~100 interessante zaken | $1.70 |
| AI (Groq) | ~50 calls (classificatie + signalen + summaries) | $0.00-0.05 |
| **Totaal per scan** | | **~$2.70** |

### Caching Strategie

Extend bestaande `lib/buurt/cache.ts`:
```
scanner-places: 7 dagen (raw place data)
scanner-signals: 3 dagen (signaal analyse)
scanner-classify: 7 dagen (AI classificaties)
```

Re-scan binnen een week hergebruikt gecachte data → alleen nieuwe/gewijzigde zaken triggeren verse API calls.

---

## 3. SIGNAAL DETECTIE — De kern van de feature

### V1 Signalen (point-in-time, geen historie nodig)

| Signaal | Bron | Detectie |
|---------|------|----------|
| Permanent gesloten | Google `businessStatus` | `=== "CLOSED_PERMANENTLY"` |
| Tijdelijk gesloten | Google `businessStatus` | `=== "CLOSED_TEMPORARILY"` |
| Lage rating + veel reviews | Google Places | `rating < 3.5 && reviewCount > 50` |
| Negatief sentiment recent | Google Reviews | AI analyse van laatste 5 reviews |
| Beperkte openingstijden | Google Hours | AI detectie van ongebruikelijke patronen |
| Prijs-locatie mismatch | Google priceLevel vs CBS | Te duur/goedkoop voor de buurt |
| Weinig reviews (onbekend) | Google reviewCount | `< 20` na 1+ jaar open |

### V2 Signalen (historisch, snapshots nodig)

| Signaal | Vereist | Detectie |
|---------|---------|----------|
| Rating daling | 2+ snapshots | Rating gedaald > 0.3 in afgelopen maand |
| Review volume afname | 2+ snapshots | Minder reviews dan verwacht |
| Openingstijden gewijzigd | 2+ snapshots | Diff tegen vorige scan |
| Van open naar gesloten | 2+ snapshots | Status change detection |

### Signal Score Berekening (0-100)

```
Permanent gesloten:     +40
Tijdelijk gesloten:     +30
Rating < 3.0:           +25
Rating daling > 0.5:    +20
Negatief sentiment:     +15
Weinig reviews:         +10
Beperkte uren:          +10
Prijs mismatch:         +5
Stale presence:         +5

Score = min(100, som van signalen)
```

---

## 4. DATABASE SCHEMA

### Nieuwe modellen (aligned met feature spec)

```prisma
model MonitoredBusiness {
  // Kern: Google Places data
  // Locatie kwaliteit: buurt analyse cache
  // Overname intelligence: signalScore, signals, aiAnalysis
  // Tracking: first/lastScannedAt, scanCount
  // Relations: snapshots, matches
}

model BusinessSnapshot {
  // Periodieke opname: rating, reviewCount, recentReviews, isOpen
  // Voor trend detectie over tijd
}

model IntelligenceProfile {
  // Zoekprofiel: concept, steden, oppervlakte, demografie
  // Scan config: keywords, keten filters
  // State: active, lastScanAt, totalMatches
}

model IntelligenceMatch {
  // Junction: profile <-> business
  // matchScore + breakdown (locatie, concept, demografie, signalen, oppervlakte)
  // Status workflow: new → reviewed → starred → contacted → dismissed
}

model IntelligenceScanJob {
  // Job tracking: status, progress, results
  // Per profiel, per stad of full scan
}
```

Relatie met bestaand model: `IntelligenceProfile` linkt naar `User`, vergelijkbaar met `SearchAlert`.

---

## 5. UX & PRODUCT STRATEGIE

### Positionering: "Bloomberg Terminal voor Horeca Acquisities"

**Geen listing site** — een **decision intelligence platform**. De waarde zit niet in "wat te koop staat" maar in "wat binnenkort beschikbaar komt".

### Taalgebruik — Ethisch Verantwoord

| Intern/Raw | Naar gebruiker |
|------------|---------------|
| "Declining business" | "Transitie-kans gedetecteerd" |
| "Failing restaurant" | "Concept-verversing mogelijk" |
| "Owner struggling" | "Opvolgingskans" |
| "Rating dropping" | "Klanttevredenheid in beweging" |
| "Closed down" | "Locatie beschikbaar gekomen" |

### Wizard Flow (5 stappen, ~4 min)

1. **Concept & Strategie** — Wat zoek je? (keten uitbreiding, eerste overname, investeerder)
2. **Locaties** — Interactieve kaart met prioriteitszones (P1/P2/P3)
3. **Doelgroep & Demografie** — Leeftijd, inkomen, passanten drempels
4. **Signaal Voorkeuren** — Welke signalen triggeren een alert?
5. **Review & Start** — Samenvatting + "Start eerste scan"

**Killer UX feature**: Live preview bij elke stap — "Op basis van je criteria: ~47 zaken in je radar"

### Matches Page — Informatie Hierarchie

```
┌─────────────────────────────────────────────────────────┐
│ [Kaart + Lijst Split View]                              │
│                                                         │
│ Per Match Card:                                         │
│ 1. Naam + concept + locatie (WAT en WAAR)               │
│ 2. Match score (percentage cirkel)                      │
│ 3. Signaal badges (gekleurde chips)                     │
│ 4. Key metrics: rating ↗↘, m², buurt type               │
│ 5. Timing: "Signaal 3 dagen geleden"                    │
│ 6. Quick actions: Opslaan, Afwijzen, Rapport, Contact   │
└─────────────────────────────────────────────────────────┘
```

### Match Detail Page (hergebruik bestaande componenten!)

- **Buurt Intelligence sectie** → `buurt-intelligence.tsx` (HERGEBRUIK)
- **Concept Check** → `concept-checker.tsx` (HERGEBRUIK)
- **Kaart** → `property-map.tsx` pattern (HERGEBRUIK)
- **Grafieken** → Recharts (HERGEBRUIK)
- NIEUW: Signal Timeline, Match Score Breakdown, AI Analyse

---

## 6. MONETISATIE MODEL

### Pricing Tiers

| Tier | Prijs | Features |
|------|-------|----------|
| **Verkenner** (Free) | Gratis | 1 profiel, 1 stad, wekelijkse digest, beperkte details |
| **Scout** (Pro) | EUR 149/mnd | 3 profielen, alle steden, real-time alerts, 5 deep analyses/mnd |
| **Stratego** (Enterprise) | EUR 499/mnd | Onbeperkt, team access, API, vergelijkbare transacties, white-label |

### Value Metrics voor Klanten

- **Tijdsbesparing**: "12 uur handmatig onderzoek bespaard per week"
- **Vroege detectie**: "6 weken eerder dan Funda Horeca"
- **Dekking**: "1.247 zaken gemonitord in 3 steden — 24/7"
- **ROI**: "Abonnementskosten = 1 kans 2 weken eerder vinden"

### Lock-in Mechanismen

1. **Historische intelligence** — Vertrekken = je trend data kwijt
2. **Getrainde voorkeuren** — Matching verbetert met elke save/dismiss actie
3. **Team workflows** — Makelaar + koper + adviseur samenwerken op matches
4. **Deal pipeline** — Kanban: Radar → Interesse → Contact → Due Diligence → Onderhandeling → Gesloten

---

## 7. CONCURRENTIE ANALYSE

| Platform | Model | Intelligence? | Proactief? |
|----------|-------|--------------|-----------|
| Funda Horeca | Classified ads | Nee | Nee — alleen wat geplaatst is |
| Objectvision | Data platform | Vastgoed data, geen horeca | Nee |
| Horecamakelaar.nl | Broker site | Netwerk, geen tech | Nee |
| BedrijfsPand.com | Aggregator | Nee | Nee |
| **Horecagrond Intelligence** | **AI platform** | **Multi-bron, signalen, AI** | **Ja — vindt kansen vóór de markt** |

**Geen enkele concurrent combineert**: proactieve signaaldetectie + multi-bron data fusie + buyer-centric matching.

**Competitive moat**: Elke dag monitoring = meer historische data. Een concurrent die morgen start heeft 0 maanden historie. Na 12 maanden is die achterstand onmogelijk in te halen.

---

## 8. DATA ETHIEK & GDPR

### Ethisch Framework: "Marktintelligentie, geen surveillance"

**Acceptabele bronnen** (openbaar):
- Google Maps ratings/reviews
- KvK registraties en mutaties
- Nieuwsartikelen en persberichten
- Gemeente vergunningendatabases
- Faillissementsverslagen (Rechtspraak.nl)

**Niet acceptabel**:
- Privé financiële data
- Persoonlijke social media van eigenaren
- Data achter login walls

### GDPR Maatregelen

1. **Legitimate interest basis** (Art. 6(1)(f)) voor B2B data processing
2. **Opt-out mechanisme** — zaakeigenaar kan monitoring stoppen
3. **Data retention** — signalen ouder dan 24 maanden archiveren
4. **DPIA** uitvoeren voor lancering (systematische monitoring)
5. **Recht op inzage** — eigenaar kan opvragen welke data is opgeslagen

### Business Owner Portal (toekomst)

Laat zaakeigenaren hun profiel claimen → transformeert surveillance naar **two-sided marketplace**:
- Eigenaar ziet "markt-aantrekkelijkheidsscore" (positief geframed)
- Kan aangeven open te staan voor gesprekken
- Ethisch bezwaar → feature

---

## 9. GROWTH FLYWHEEL

```
Meer zoekers → Meer profielen → Betere vraag-inzichten
     ↑                                    ↓
Case studies ←── Succesvolle overnames ←── Betere matches
     ↓                                    ↑
Meer zoekers → Meer feedback → Beter algoritme → Meer data
```

### Fase-gewijs

1. **Data seeding** (maand 1-6): Index alle horecazaken in target steden VOORDAT users er zijn
2. **Design partners** (maand 3-9): 10-20 klanten zoals de poké bowl keten, korting, feedback
3. **Network effects** (maand 6-18): Geaggregeerde vraagdata wordt waardevol
4. **Intelligence marketplace** (maand 12-24): Verkoop geanonimiseerde data aan consultants, banken, gemeenten

---

## 10. USE CASES — Concrete Verkoopverhalen

### Use Case 1: Lorenzo's Poké Bowl Keten (de originele aanvraag)

**Profiel**: Snelgroeiende healthy fast-food keten, zoekt overnames van poké/sushi/lunch ketens (3-25 vestigingen) + individuele locaties in Amsterdam, Utrecht, Leiden, Haarlem.

**Wat de scanner doet**:
1. Scant 14 steden, vindt 1.247 horecazaken in relevante categorieën
2. Classificeert: 89 directe concurrenten (poké/sushi), 234 lunch concepten, rest irrelevant
3. Detecteert signalen: 23 zaken met dalende reviews, 7 recent gesloten, 3 met meerdere vestigingen (keten overname)
4. Matcht tegen profiel: 47 matches boven 50%, waarvan 12 "strong matches" (80+)
5. Genereert per match: AI samenvatting, locatie analyse, concept fit score

**Resultaat**: Lorenzo krijgt wekelijks een briefing: "3 nieuwe kansen deze week — waaronder een sushi keten met 5 vestigingen in Utrecht die tekenen van transitie toont."

**Waarde**: Zonder scanner zou Lorenzo dit handmatig moeten doen (Google Maps browsen, reviews lezen, KvK checken) — geschat 20+ uur per week. Met scanner: 30 minuten om matches te reviewen.

### Use Case 2: Horecamakelaar als Power User

**Profiel**: Makelaar met 8 actieve zoekende klanten, elk met eigen profiel.

**Wat de scanner doet**:
1. 8 profielen actief, elk met eigen steden en criteria
2. Wekelijkse geautomatiseerde scan van alle relevante gebieden
3. Matches worden automatisch aan het juiste klantprofiel gekoppeld
4. Makelaar krijgt dagelijkse digest: "5 nieuwe kansen verdeeld over 3 klanten"

**Resultaat**: Makelaar kan proactief klanten benaderen met kansen — in plaats van reactief wachten op Funda listings.

**Waarde**: Differentiatie ten opzichte van andere makelaars. "Ik heb een AI-systeem dat 24/7 de markt voor u monitort."

### Use Case 3: Franchise Organisatie

**Profiel**: Franchise organisatie zoekt locaties voor nieuwe vestigingen in heel Nederland.

**Wat de scanner doet**:
1. Scant alle 14+ steden voor geschikte locaties
2. Niet alleen bestaande zaken, ook "gaten in de markt" detectie
3. Combineert met demografie (CBS) en passantendata voor locatie scoring
4. Signaleert wanneer een concurrent in een target gebied sluit → kans!

**Resultaat**: Franchise organisatie heeft een real-time marktbeeld van heel Nederland.

### Use Case 4: Investeerder / Portfolio Builder

**Profiel**: Horeca-investeerder zoekt ondergewaardeerde zaken op A-locaties.

**Wat de scanner doet**:
1. Focust op hoge signaalscores + premium locaties
2. Combineert: A-locatie (hoge passanten, goede bereikbaarheid) + dalende zaak (lage rating, gesloten)
3. Berekent "locatie premium vs zaak performance gap" — hoe groter de gap, hoe interessanter

**Resultaat**: "Deze locatie op de Kalverstraat met 15.000 passanten/dag heeft een zaak met rating 2.8 — de locatie alleen is al meer waard dan de overname."

---

## 11. IMPLEMENTATIE VOLGORDE (Aanbeveling)

### Sprint 1: Database & Core Engine (3-4 dagen)
- Prisma schema (5 modellen)
- Scanner engine (grid search + Google Places)
- Signal detector (pure functions)
- Basis matching

### Sprint 2: Trigger.dev Pipeline & Server Actions (2-3 dagen)
- Orchestrator + subtasks
- CRUD server actions
- Scan trigger + progress tracking

### Sprint 3: Dashboard UI (4-5 dagen)
- Overview page met stats
- Profiel wizard (5 stappen)
- Matches lijst + kaart
- Match detail page (hergebruik buurt-intelligence + concept-checker)

### Sprint 4: Polish & Integratie (2-3 dagen)
- Email notificaties
- CSV export
- Loading states + error boundaries
- Mobile responsive

### Sprint 5: Advanced (optioneel)
- KvK integratie
- Review sentiment analyse
- Keten groepering
- Business Owner Portal

---

## 12. RISICO'S & MITIGATIE

| Risico | Impact | Mitigatie |
|--------|--------|----------|
| Google Places API kosten bij grote scans | Medium | Agressieve caching (7 dagen), batch per stad |
| Ethische bezwaren in pers | Hoog | Positieve framing, opt-out, DPIA, Business Owner Portal |
| AI hallucinaties in match summaries | Medium | Factual grounding, confidence levels, "draft" label |
| Rate limiting bij veel users | Laag | Queue concurrency limits, scan scheduling |
| Data kwaliteit variatie per stad | Medium | Quality scoring (bestaand), data completeness indicators |
| Concurrent kopieert feature | Laag | Data moat (historische signalen), trained preferences |
