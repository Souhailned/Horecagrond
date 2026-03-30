# Intelligence Scanner — Data Sources Analyse

> Datum: 2026-03-24
> Doel: Bepaal per databron de beste aanpak (API vs scraping vs proxy)

---

## Overzicht per Databron

### TIER 1: Officiële API's (betrouwbaar, geen blocking risico)

| Bron | API? | Wat levert het? | Kosten | Status |
|------|------|-----------------|--------|--------|
| **Google Places API** | ✅ Ja (v1) | Rating, reviews, openingstijden, businessStatus, priceLevel, photos | ~$0.03/call | **AL GEÏNTEGREERD** |
| **CBS/PDOK** | ✅ Ja (open data) | Demografie, inkomen, leeftijd per buurt | Gratis | **AL GEÏNTEGREERD** |
| **BAG/PDOK** | ✅ Ja (open data) | Bouwjaar, oppervlakte, gebruiksdoel | Gratis | **AL GEÏNTEGREERD** |
| **OpenKvK** | ✅ Ja (openkvk.nl) | KvK nummer, eigenaar, vestigingen, rechtsvorm, SBI-codes | Gratis (beperkt) | **SCRAPEN WERKT** — bewezen via Firecrawl |

### TIER 2: Scrapable zonder proxy (Firecrawl werkt direct)

| Bron | API? | Wat levert het? | Blocking risico? | Status |
|------|------|-----------------|-------------------|--------|
| **TripAdvisor** | ❌ Geen publieke API meer | Ranking, reviews, cuisine types, prijsrange | Medium — rate limit na ~50 req | **SCRAPEN WERKT** — 288 regels data |
| **AlleCijfers.nl** | ❌ Geen API | Veiligheid, voorzieningen, woningwaarde per buurt | Laag — statische site | **SCRAPEN WERKT** — openbare data |
| **Thuisbezorgd.nl** | ❌ Geen publieke API | Restaurant listings, ratings, bezorggebied, menu | Medium — JS-heavy maar Firecrawl haalt 869 regels | **SCRAPEN WERKT** — maar JS rendering nodig |
| **OpenKvK.nl** | Semi-API | Bedrijfsgegevens, vestigingen | Laag | **SCRAPEN WERKT** — KvK + adres + SBI |
| **Funda Horeca** | ❌ Geen API | Te koop staande horecapanden, prijzen, m² | Hoog — JS SPA, anti-scraping | **MOEILIJK** — JS-heavy, alleen filters zichtbaar |
| **Misset Horeca / De Ondernemer** | ❌ Geen API | Horeca nieuwsberichten, overnames, trends | Laag — nieuwssite | **SCRAPEN WERKT** via search |

### TIER 3: Problematisch (proxy nodig OF niet de moeite)

| Bron | API? | Probleem | Oplossing |
|------|------|----------|-----------|
| **Uber Eats** | ❌ | Blokkeert scraping volledig (6 regels data) | 🚫 Skip — Thuisbezorgd dekt NL markt beter |
| **Deliveroo** | ❌ | Zware anti-bot, JS rendering | 🚫 Skip — Thuisbezorgd dekt NL markt beter |
| **Funda Horeca** | ❌ | JS SPA, anti-scraping | 🟡 DataImpulse proxy + Firecrawl browser OF skip |
| **Google Maps (web)** | N/A | Niet nodig — Google Places API is beter | ✅ Gebruik API |
| **Yelp** | Ja (Fusion API) | Beperkte NL dekking, max 50 results | 🟡 Optioneel — weinig NL data |
| **Instagram/Social** | ❌ | Anti-scraping, auth vereist | 🚫 Skip voor v1 |

---

## Aanbevolen Architectuur per Bron

### Aanpak 1: API-first (geen proxy nodig)
```
Google Places API  →  Rating, reviews, status, hours
CBS/PDOK API       →  Demografie, inkomen, leeftijd
BAG API            →  Oppervlakte, bouwjaar, bestemming
```
**Status**: Al geïntegreerd ✅

### Aanpak 2: Firecrawl direct scraping (geen proxy nodig)
```
OpenKvK.nl         →  Eigenaar, KvK, vestigingen, SBI
AlleCijfers.nl     →  Buurt veiligheid, voorzieningen
TripAdvisor        →  Deep reviews, ranking, cuisine
Thuisbezorgd.nl    →  Delivery rating, menu, bezorggebied
Google News        →  Nieuwsberichten over zaak/keten
Horeca nieuws      →  Overnames, trends, faillissementen
```
**Status**: Bewezen via POC tests ✅ — implementatie nodig

### Aanpak 3: Proxy + Firecrawl browser (voor moeilijke sites)
```
Funda Horeca       →  Te koop staande panden
```
**Status**: Optioneel — DataImpulse proxy als we dit echt nodig hebben

---

## Data per Zaak — Wat we verzamelen

### Van Google Places API (TIER 1):
- Naam, adres, stad, postcode
- Latitude/longitude
- Rating (1-5) + aantal reviews
- Price level (€-€€€€)
- Business status (open/gesloten)
- Openingstijden
- Website URL
- Telefoon
- Google Place ID
- Laatste 5 reviews (tekst + rating)
- Foto URLs

### Van OpenKvK (TIER 2 — Firecrawl):
- KvK nummer
- Eigenaar naam
- Rechtsvorm (BV, VOF, Eenmanszaak)
- Aantal vestigingen (keten detectie!)
- SBI-code (activiteitscode)
- Datum inschrijving (hoe lang bestaat de zaak?)
- Adres (match met Google data)

### Van TripAdvisor (TIER 2 — Firecrawl):
- TripAdvisor ranking (bv "#45 van 234 restaurants")
- Rating + aantal reviews
- Cuisine types
- Prijsrange
- Recente reviews (sentiment analyse)
- Populariteitstrend

### Van Thuisbezorgd (TIER 2 — Firecrawl):
- Bezorg rating
- Aantal beoordelingen
- Minimum bestelbedrag
- Bezorgtijd
- Menu items + prijzen
- Logo/foto

### Van AlleCijfers (TIER 2 — Firecrawl):
- Veiligheidsindex buurt
- Voorzieningen score
- Gemiddelde woningwaarde
- Aantal horeca in buurt
- Bevolkingsdichtheid

### Van Horeca Nieuws (TIER 2 — Firecrawl search):
- Recent nieuws over de zaak/keten
- Overname berichten
- Faillissementen
- Expansie/sluiting berichten

---

## Proxy Strategie

### Wanneer proxy nodig?
- TripAdvisor: na ~50 requests per uur → rate limit
- Thuisbezorgd: na ~30 requests per uur → JS challenge
- Funda Horeca: direct geblokkeerd zonder proxy

### DataImpulse (app.dataimpulse.com)
- Rotating residential proxies
- €1.00/GB data transfer
- Nederlandse IP adressen beschikbaar
- API integratie via HTTP proxy

### Alternatief: Firecrawl zelf
- Firecrawl heeft ingebouwde proxy/rotation
- 899 credits beschikbaar
- Elke scrape = 1 credit
- Voor 100 zaken × 4 bronnen = 400 credits per scan

### Aanbeveling:
1. **Start met Firecrawl direct** (geen proxy) — voor 80% van de data
2. **DataImpulse alleen als nodig** — voor TripAdvisor/Thuisbezorgd bij hoog volume
3. **Skip Funda/UberEats** — niet de moeite vs het risico

---

## Kosten Schatting per Scan (10 steden)

| Bron | Calls | Kosten |
|------|-------|--------|
| Google Places API | ~130 | $4.16 |
| Firecrawl (OpenKvK) | ~100 | 100 credits |
| Firecrawl (TripAdvisor) | ~100 | 100 credits |
| Firecrawl (Thuisbezorgd) | ~100 | 100 credits |
| Firecrawl (AlleCijfers) | ~14 | 14 credits |
| Firecrawl (News search) | ~10 | 10 credits |
| AI (Groq) | ~50 | $0.00-0.05 |
| **Totaal** | | **~$4.20 + 324 credits** |

Met 899 credits: ~2.7 volledige scans beschikbaar.
