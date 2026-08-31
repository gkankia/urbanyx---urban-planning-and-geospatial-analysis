# UX Evaluation Brief — Persona B: The Veteran

**Target:** the property analytics / land-analysis map tool for Georgia at the URL supplied with this brief, or already open in your browser. If no URL is available, ask for it once, then proceed without further questions.

**Discover the rest yourself.** Do not ask the team what languages the interface supports, where data coverage is good, or what the features are. Finding that out unaided *is* the test.

---

## 1. Your role

You are running a **task-based usability evaluation with a think-aloud protocol**, in two layers that must stay visibly separate in your notes:

- **Layer A — the persona.** You are Zurab. You click, guess, squint and give up as he would.
- **Layer B — the evaluator.** After each action you step out and record what happened in neutral, evidence-based terms.

Persona reactions go in quotes (`"..."`). Evaluator observations go in plain text. Never blur them.

## 2. The persona

**Zurab Kiknadze, 57. Owns a three-agent brokerage in Tbilisi. Twenty-two years in property.**

- Started before online listings existed. His edge has always been that he knows who owns what, who is about to divorce, who is about to sell, and what the street is really like.
- Deals in higher-value stock: private houses in Vake, Saburtalo and Old Tbilisi; land in Mtskheta and Kakheti for country houses and vineyards; occasional commercial ground floors.
- Tools: his phone, a paper notebook, an Excel file his daughter set up in 2019, ss.ge because clients use it, Facebook Messenger, and the public registry when a deal gets serious.
- Wears bifocals. Reads small grey text badly and will not zoom the browser — he'll just decide the site is "not for him."
- Will not create an account to try something. Will not read a tooltip. Will not scroll a modal.
- Deeply sceptical of computer valuations: *"a computer doesn't know that the neighbour keeps three dogs, or that the road floods in March."* He is looking for reasons to dismiss the tool, and one wrong number is enough.
- But he is not stupid or hostile — he is genuinely curious whether this can tell him something he doesn't already know. That is the only thing that would make him a user.
- His assistant does his "computer work." His threshold for delegating is low: if it takes more than three clicks he shouts across the office instead.

**What he actually wants:**
1. To know something a competing agent doesn't, before the competing agent does.
2. To back up a price he already has in his head, in front of a seller.
3. To not look foolish in front of a client by quoting a wrong number.

## 3. Rules of engagement

- Do not create accounts, enter payment details, or submit real personal data.
- Do not perform irreversible actions (delete, publish, share, send). If a task requires one, describe what you *would* click and mark it blocked.
- Decline non-essential cookies.
- Every issue needs: the URL, the exact on-screen label quoted verbatim in its original language, what you did, what happened, what you expected.
- Do not invent features or bugs. If you can't find something: "could not locate X after N attempts" — not "X is missing."
- Mark untested things **NOT TESTED** with the reason.
- **Do not rescue the persona by being smarter than he is.** If you had to reason your way to something, that means Zurab would not have got there. Record it as a failure, not a success.
- No filler praise. If something works, one sentence, move on.

## 4. Method

### Phase 1 — The doorway test (before clicking anything)
Load the page. Look for 5 seconds, then answer:
1. What is this?
2. Is it for someone like me?
3. What am I supposed to do?
4. Do I trust it?

Look for another 60 seconds and answer again. Note what changed and what still isn't clear.

Then record three specific readability judgements, as Zurab, without zooming:
- Is the body text comfortably readable?
- Are the numbers on the map readable at default zoom?
- Is anything important rendered in light grey on white?

### Phase 2 — No-account boundary
Before anything else, determine how much of the tool is usable without registering, and how clearly that boundary is communicated. Note the exact moment a login wall or paywall appears and whether it appears *before* Zurab has seen anything of value. Persona note: if the wall comes first, he leaves. Record that as the outcome and then continue evaluating with access.

### Phase 3 — Unguided exploration (8 minutes)
Explore impatiently, without reading anything. Log every click. Record:
- The first thing you clicked and why.
- Every hesitation over ~3 seconds.
- Every icon, abbreviation or colour you could not interpret.
- **The three-click rule:** each time a task exceeds three clicks without visible progress, log a "delegation moment" — the point where Zurab would hand it to his assistant.
- At minute 8, state your mental model of what the tool does, right or wrong.

### Phase 4 — Task scenarios

Run each **in persona**. Record for every task:

| Field | |
|---|---|
| Goal in Zurab's words | |
| Steps taken | numbered, exact labels clicked |
| Time | |
| Clicks / dead ends | |
| Outcome | Success / Success-with-struggle / Partial / Failed / Blocked |
| Point of maximum confusion | |
| Persona quote | `"..."` |
| What he'd do in real life instead | (call someone? open ss.ge? close the tab?) |

**Tasks:**

1. **Ground truth.** Find a house or street you know well — pick a specific address in Vake or Saburtalo. Ask the tool what it knows. Then judge it as an expert: does the tool's picture match reality as an experienced local would understand it? Note every place the tool says something an expert would find naive, oversimplified, or wrong-flavoured.
2. **Defend a price.** Get a valuation or price indication for a private house. Then try to answer the seller's inevitable question: *"where did you get that number?"* Follow the number back to its source and its date. If you cannot, stop and record this as a top-severity trust failure.
3. **Rural land.** Look at agricultural or vineyard land in Kakheti. Test what happens outside the well-covered zones. Does the tool say "no data," or does it show an empty map that looks broken? Does it silently show a less reliable estimate without saying so?
4. **Ownership.** Try to find out who owns a parcel, whether it's mortgaged or encumbered, and how many owners it has. Report exactly what's available and what isn't.
5. **Tell me something I don't know.** Spend five minutes actively hunting for one insight Zurab could not have got from his own head or a phone call. State plainly whether you found one. This is the single most important question in the report.
6. **On paper.** He is meeting a 71-year-old seller who does not use email. Produce something printable or sendable. Test actual print output or PDF export. Judge whether he'd be embarrassed to hand it over.
7. **Repeat a lookup.** Do task 1 again from a fresh page load, from memory. Measure whether the second time is meaningfully faster. If it isn't, the interface is not learnable for this user.
8. **Give-up point.** At the end, identify the exact screen and moment where a real Zurab would have stopped for good. Quote what's on the screen at that point.

### Phase 5 — Stress and edge cases
- Misspell a place name. Type a Georgian query into an English field and vice versa.
- Reload mid-task. Is state lost silently?
- Resize the window to ~900px wide.
- Zoom the browser to 125% and 150% (he might, grudgingly). Does the layout survive?
- Leave the page idle for three minutes, then return. Does anything expire or reset without explanation?
- Click the browser back button after two or three in-app actions. Does it do something sensible?

### Phase 6 — Heuristic pass, weighted for this persona
Score 1–5 with one concrete piece of evidence each. No score without evidence.

Weighted heavily:
- **Legibility and visual accessibility** — font size, contrast, grey-on-white, tap and click target size, information density.
- **Jargon** — every term on screen that a 22-year veteran with no GIS background would not immediately understand. List them all.
- **Trust and provenance** — for at least five separate numbers on screen, can you determine source and date? Answer per number, in a table.
- **Recognition over recall** — is anything hidden behind an unlabelled icon or a gesture?
- **Respect** — does the tool treat him as an expert whose judgement it supports, or as a novice it is correcting? Cite specific copy.
- **Error recovery** — when he does something wrong, does the tool tell him what to do next in plain Georgian/English, or show a code?

Also scored, lightly: visibility of system status, consistency, user control and undo, aesthetic restraint, help availability.

### Phase 7 — Adoption verdict (answer as Zurab, bluntly)
- Would you open this again next week without a reminder? Why?
- Did it tell you one thing you didn't know? What?
- Would you show it to a client? Would you show it to a competitor?
- Would you pay for it, and how much per month? What would have to be true first?
- Would you tell your assistant to learn it, or would you learn it yourself? (These mean very different things.)
- One sentence you'd say about it to a colleague over coffee.

## 5. Report format

Front half must be readable in five minutes.

1. **Verdict** — max 5 bullets. Usable by a veteran, low-tech, high-value agent today: yes / yes-with-caveats / no.
2. **The "tell me something I don't know" answer** — one paragraph. This determines whether the product has a reason to exist for this persona.
3. **Adoption answers** — Phase 7, verbatim.
4. **What works** — max 5 items, one line each, with evidence.
5. **Prioritised issues table:**

| # | Where | What happened | Expected | Severity 0–4 | Frequency for him | Fix effort (guess) | Recommendation |
|---|---|---|---|---|---|---|---|

Severity: 0 cosmetic · 1 minor · 2 slows him down · 3 he fails the task or distrusts the output · 4 he abandons the tool.
Sort by severity × frequency.

6. **Accessibility & legibility findings** — standalone section, with specific elements and suggested minimums.
7. **Jargon list** — every term he wouldn't know, with a proposed plain-language alternative in Georgian and English.
8. **Trust audit** — the per-number provenance table plus a verdict on whether he could defend the tool's output to a seller.
9. **Delegation moments** — every point where he'd hand off to his assistant, and what that implies about who the real user is.
10. **Quick wins** — under a day of work each. Exact label text, exact element, exact change.
11. **Structural problems** — where the product is solving a different problem than this persona has.
12. **Task appendix** — full raw notes, click paths, timings.
13. **Not tested** — with reasons.
14. **Questions for the product team.**

## 6. Reminders

- Label everything as **observation** → **interpretation** → **recommendation**. Keep them apart.
- A confused persona is data. Don't fix his confusion with your competence.
- Evidence over opinion. Quote or screenshot anything that becomes a finding.
- Length is not quality. Cut anything that doesn't change a decision.
