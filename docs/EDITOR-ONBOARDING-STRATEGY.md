# Editor Onboarding Strategy — Horecagrond Makelaars

**Datum:** 2026-03-25
**Doelgroep:** Horeca makelaars (niet-technisch)

---

## Competitor Analyse

| Platform | Aanpak | Key Takeaway |
|----------|--------|-------------|
| **Floorplanner** | Template-first, "geen training nodig", PDF manual voor power users | Simpelheid werkt, maar manual voor gevorderden nodig |
| **RoomSketcher** | Multi-path: Draw/Trace/AI Convert + gefaseerde mode knoppen | Gefaseerde workflow reduceert cognitive load |
| **Planner 5D** | Rol-selectie bij signup, 149 video tutorials, design course | Personalisatie per rol verhoogt activatie |
| **Matterport** | Realtime visuele feedback (progress rings, target dots) | Feedback TIJDENS de taak, niet alleen ervoor |
| **SmartDraw** | Template-heavy met domein-specifieke layouts | Horeca-specifieke templates zijn essentieel |
| **Simple Host** | Restaurant-specifiek: drag-drop tafels, zones, capaciteit | Capaciteit en zones moeten front-and-center |

---

## Aanbevolen Strategie (Geprioriteerd)

### Quick Wins (1-3 dagen)

#### 1. Empty State Overlay op Canvas (HOOGSTE IMPACT)
Als het canvas leeg is, toon een centered overlay:
- **"Kies een template"** (aanbevolen, groene badge) → TemplateDialog
- **"Laat AI genereren"** → AiGenerateDialog met property data pre-filled
- **"Begin vanaf nul"** → start guided tour

> De #1 reden dat niet-technische gebruikers afhaken is "blank canvas paralysis"

#### 2. Pre-fill AI Generate Formulier
Vul automatisch in vanuit Property record:
- Oppervlakte (surfaceTotal)
- Type pand (propertyType)
- Zitcapaciteit (seatingCapacity)

#### 3. Welcome Modal bij Eerste Gebruik
Bij eerste editor bezoek (localStorage `hasSeenEditorTour`):
- Stap 1: Kies pad (template / AI / zelf tekenen)
- Als "zelf tekenen": start 4-stappen tooltip tour

#### 4. Status Bar Verbetering
- Pulserende dot bij eerste gebruik
- Tooltip: "Tip: kijk hier voor instructies"
- Idle nudge na 10 seconden: "Klik op het canvas om te beginnen"

#### 5. Help Knop in Toolbar
"?" knop die linkt naar help artikelen en sneltoetsen

### Medium Term (1-2 weken)

#### 6. Guided Tooltip Tour (4-5 stappen)
Gebruik Radix Popover met dynamische positionering:
1. Toolbar → "Dit zijn uw tekentools"
2. Wall tool → "Klik twee punten voor een muur"
3. Zone tool → "Teken zones voor ruimtes"
4. Asset panel → "Kies meubilair"
5. 2D/3D toggle → "Wissel tussen boven- en 3D-aanzicht"

> Research: interactive walkthroughs verhogen activatie met 47%

#### 7. Template Library Uitbreiden (10+ horeca types)
- Bar 60m², Eetcafe 90m², Lunchroom 45m²
- Hotel lobby 120m², Snackbar 35m², Pizzeria 70m²
- Koffiebar 30m²
- Elk met thumbnail preview

#### 8. Onboarding Checklist (Floating)
Klein floating element rechtsonder:
```
Uw eerste plattegrond:
[x] Template of AI gebruikt
[ ] Muren getekend
[ ] Zones gemarkeerd
[ ] Meubilair geplaatst
[ ] Opgeslagen
```
Auto-checks bij voltooiing, verdwijnt na alle items.

#### 9. Tool First-Use Tooltips
Bij eerste gebruik van elk tool, eenmalige tooltip met micro-animatie:
- Wall: geanimeerde GIF van twee klikken
- Zone: GIF van polygon tekenen
- Item: GIF van klik-om-te-plaatsen

### Longer Term (2-4 weken)

#### 10. Video Tutorial Series (NL)
10 video's van 2-3 minuten:
1. "Uw eerste plattegrond maken"
2. "Muren tekenen en aanpassen"
3. "Zones markeren"
4. "Meubilair plaatsen"
5. "3D-weergave gebruiken"
6. "AI plattegrond genereren"
7. "Foto scannen"
8. "Exporteren en delen"
9. "Sneltoetsen"
10. "Tips voor horeca indelingen"

#### 11. Help Center Artikelen

**Tier 1 (week 1):**
- "Uw eerste plattegrond in 5 stappen"
- "Templates gebruiken"
- "AI plattegrond genereren"
- "Editor overzicht"

**Tier 2 (week 2-3):**
- "Muren tekenen: rechte en vrije hoeken"
- "Zones markeren en types toewijzen"
- "Meubilair plaatsen, draaien, kopiëren"
- "Afmetingen opmeten"

---

## UI Design Patterns

### Pattern A: Canvas Empty State
Centered overlay op leeg canvas met 3 CTAs + tip tekst.
Verdwijnt zodra eerste node gecreëerd wordt.

### Pattern B: Smart Defaults voor Horeca
- Context-aware zone type: als laatste zone "keuken" was, suggereer "prep_area"
- Suggested room sizes bij zone hover:
  - Keuken: 15-25m²
  - Eetruimte: 30-60m²
  - Bar: 8-15m²
  - Opslag: 5-10m²

### Pattern C: Persistent Measurement Labels
Meetresultaten blijven zichtbaar in 2D mode (togglebaar).
Kritiek voor makelaars die dimensies communiceren.

### Pattern D: Properties Panel Empty State
- Geen elementen: "Begin met muren tekenen"
- Elementen maar niets geselecteerd: summary (m², muren, items)
- Meerdere geselecteerd: bulk acties

---

## Taalrichtlijnen
- Altijd Nederlands
- Informeel "u" vorm
- Vermijd technisch jargon: "plattegrond" niet "floor plan"
- Horeca terminologie: "eetruimte", "bar", "keuken", "terras", "opslag"
- "bovenaanzicht" niet "2D orthographic projection"

---

## Samenvatting

**Hoogste ROI:** Empty state overlay + welcome modal die makelaars stuurt naar templates of AI generatie. Dit lost het #1 probleem op: de eerste 10 seconden wanneer een niet-technische gebruiker een leeg canvas ziet en niet weet wat te doen.

**Bestaande sterke basis:** Status bar guidance (al in het Nederlands, al contextueel per tool) is een goed fundament. De AI tools (genereren + scannen) zijn al gebouwd en zijn de snelste weg naar waarde voor makelaars.
