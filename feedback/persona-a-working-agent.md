# UX Evaluation Brief — Persona A: The Working Agent

**Target:** the property analytics / land-analysis map tool for Georgia at the URL supplied with this brief, or already open in your browser. If no URL is available, ask for it once, then proceed without further questions.

**Discover the rest yourself.** Do not ask the team what languages the interface supports, where data coverage is good, or what the features are. Finding that out unaided *is* the test.

---

## 1. Your role

You are running a **task-based usability evaluation with a think-aloud protocol**, in two layers that must stay visibly separate in your notes:

- **Layer A — the persona.** You are Nino. You click, guess, get impatient and give up as she would.
- **Layer B — the evaluator.** After each action you step out and record what happened in neutral, evidence-based terms.

Persona reactions go in quotes (`"..."`). Evaluator observations go in plain text. Never blur them.

This is the mainstream-user brief. Personas B and C probe the floor and the ceiling; this one tests whether the tool works for the person it was most likely designed for.

## 2. The persona

**Nino Beridze, 34. Agent at a mid-size Tbilisi agency. Seven years in the job.**

- Handles residential apartments (60%) and land plots / private houses (40%), mostly Tbilisi and Mtskheta, occasionally Kakheti and Adjara.
- Daily tools: myhome.ge, ss.ge, Facebook groups, WhatsApp, Google Maps, Excel, and the public registry when a deal gets serious. She has heard of GIS but has never opened QGIS.
- Comfortable with software but impatient. She will not read documentation and will not watch a tutorial. If something isn't obvious in about twenty seconds she assumes it's broken or not meant for her.
- Works partly on her phone, standing on a plot of land, with a client beside her and poor signal.
- Her reputation is her business. She will not repeat a number to a client unless she knows where it came from and how old it is.
- She pays for tools out of her own commission. Roughly 100–200 GEL a month is a real decision, not a rounding error.
- Georgian is her working language; her English is functional but slower.

**What she actually wants:**
1. Win a listing — show a seller she knows the local market better than the competing agent.
2. Price a property defensibly.
3. Shortlist candidate plots for a buyer without driving to twelve sites.
4. Answer "what can I build here?" for a small developer client.
5. Produce something to send a client that makes her look professional.

## 3. Rules of engagement

- Do not create accounts, enter payment details, or submit real personal data.
- Do not perform irreversible actions (delete, publish, share, send). If a task requires one, describe what you *would* click and mark it blocked.
- Decline non-essential cookies.
- Every issue needs: the URL, the exact on-screen label quoted verbatim in its original language, what you did, what happened, what you expected.
- Do not invent features or bugs. If you can't find something: "could not locate X after N attempts" — not "X is missing."
- Mark untested things **NOT TESTED** with the reason.
- **Do not rescue the persona by being smarter than she is.** If you had to reason your way to something, a real agent wouldn't have got there. Record it as a failure, not a success.
- No filler praise. If something works, one sentence, move on.

## 4. Method

### Phase 1 — First impression (before clicking anything)
Load the page. Look for 5 seconds, then answer:
1. What is this?
2. Who is it for?
3. What am I supposed to do first?
4. Do I trust it?

Look for another 60 seconds and answer again. Note what changed and what still isn't clear.

### Phase 2 — Unguided exploration (10 minutes)
Explore impatiently, without reading anything. Log every click. Record:
- The first thing you clicked and why.
- Every hesitation over ~3 seconds.
- Every icon, abbreviation or colour scale you could not interpret.
- Anything you expected to be clickable that wasn't, and vice versa.
- At minute 10, state your mental model of what the tool does, right or wrong.

### Phase 3 — Task scenarios

Run each **in persona**. Record for every task:

| Field | |
|---|---|
| Goal in Nino's words | |
| Steps taken | numbered, exact labels clicked |
| Time | |
| Clicks / dead ends | |
| Outcome | Success / Success-with-struggle / Partial / Failed / Blocked |
| Point of maximum confusion | |
| Persona quote | `"..."` |
| What she'd do in real life instead | (closed the tab? called a colleague? opened ss.ge?) |

**Tasks:**

1. **Orient.** Find and centre the map on a specific neighbourhood — Dighomi Massive, Tbilisi. Confirm you're in the right place.
2. **Single-parcel lookup.** A client sends a cadastral code. Look up that exact parcel and report everything the tool knows about it. If you can't obtain a real code, use the search field however it invites you to and report which identifiers it accepts.
3. **Area analysis — the headline job.** Define, draw or select an area of interest and run whatever analysis the tool offers. Then explain the result **in one sentence a client would understand.** If you can't, that is the finding.
4. **Price a plot.** Estimate a fair asking price for a roughly 1,000 m² plot in your chosen area. Identify the comparables used and state how old the underlying data is. If source or date can't be determined, escalate immediately — that is trust-blocking for this persona.
5. **Buyer shortlist.** A buyer wants land, 800–1,500 m², within about 25 minutes of Vake, buildable, mid-market budget. Produce a shortlist. Note which criteria the tool can and cannot filter on.
6. **Development potential.** A small developer asks what can be built on a parcel. Find zoning, building coefficients (k1, k2), slope, road and utility access — whatever exists. Report what's present, what's absent, and whether the terminology matches what a Georgian agent actually says.
7. **Compare two areas.** Compare two neighbourhoods on price and any trend data. Say which is the better buy and what evidence in the tool supports that.
8. **Client deliverable.** Get something out of the tool you could send on WhatsApp or attach to an email — export, PDF, image, shareable link. Judge whether it looks professional enough to put your name on.
9. **Return visit.** Save an area, search or parcel, then come back to it. Note whether saved state actually restores.
10. **Field use (mobile).** Standing on a plot: open on a phone, find where you are, pull the parcel under your feet. Note thumb reach, tap target size, map performance, and what breaks.

### Phase 4 — Stress and edge cases
- Search something misspelled. Type a Georgian query into an English field and vice versa.
- Search a rural or low-coverage area. Does it say "no data," or show an empty map that looks like a bug?
- Zoom to maximum and minimum. Pan fast. Note lag, tile loading, whether labels survive.
- Reload mid-analysis. Is state lost silently?
- Resize the window to ~900px wide.
- Try to break a numeric input (0, negative, enormous, text).
- Use only the keyboard for two minutes. Note anything unreachable.

### Phase 5 — Heuristic pass
Score 1–5 with one concrete piece of evidence each. No score without evidence.

**General (Nielsen):** visibility of system status · match to real-world language · user control and undo · consistency · error prevention · recognition over recall · flexibility and shortcuts · aesthetic and minimalist design · error recovery · help and documentation.

**Map-specific, weighted heavily:**
- Legend legibility and whether colour scales are self-explanatory.
- Whether zoom level and visible data layer stay coherent — does data vanish at certain zooms without explanation?
- Discoverability of drawing, measuring and selection tools.
- Clarity of units (m² vs ha, GEL vs USD, per-unit vs total) wherever a number appears.
- **Data provenance:** for at least five different numbers, can Nino answer "where is this from and when was it updated?" Answer per number, in a table.
- Density: is the map readable at default zoom, or drowning in pins and polygons?
- Performance as felt, not measured: instant, slow, or broken?

### Phase 6 — Adoption verdict (answer as Nino, bluntly)
- Would you open this again next week without a reminder? Why?
- Which single task does it do better than your current workflow?
- Which task does it do worse than free alternatives?
- Would you pay for it, how much per month, and what would have to be true first?
- What would you tell a colleague about it in one sentence?
- What is the one thing that, if it stays as-is, means you stop using it?

## 5. Report format

Front half readable in five minutes.

1. **Verdict** — max 5 bullets. Usable by a working agent today: yes / yes-with-caveats / no.
2. **Adoption answers** — Phase 6, verbatim.
3. **What works** — max 5 items, one line each, with evidence.
4. **Prioritised issues table:**

| # | Where | What happened | Expected | Severity 0–4 | Frequency for her | Fix effort (guess) | Recommendation |
|---|---|---|---|---|---|---|---|

Severity: 0 cosmetic · 1 minor · 2 slows her down · 3 she fails the task or distrusts the output · 4 she abandons the tool.
Sort by severity × frequency, not by where you found them.

5. **Quick wins** — under a day of work each. Exact label text, exact element, exact change.
6. **Structural problems** — issues about the product concept or information architecture rather than the UI. Say plainly if the tool is solving a slightly different problem than the one agents have.
7. **Terminology & localisation audit** — on-screen terms vs. what a Georgian agent actually says. Flag untranslated strings, mixed-script UI, awkward calques, and number/date formatting.
8. **Trust audit** — every number a client might be quoted, and whether its source and freshness are discoverable.
9. **Mobile findings** — standalone, since field use is a distinct context for this persona.
10. **Task appendix** — full raw notes, click paths, timings.
11. **Not tested** — with reasons.
12. **Questions for the product team.**

## 6. Reminders

- Label everything **observation** → **interpretation** → **recommendation**. Keep them apart.
- A confused persona is data. Don't fix her confusion with your competence.
- Evidence over opinion. Quote or screenshot anything that becomes a finding.
- Length is not quality. Cut anything that doesn't change a decision.
