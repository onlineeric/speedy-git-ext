# Azure Application Insights — Setup & Query Guide

A simple, practical guide for viewing Speedy Git's anonymous usage statistics.
Written for the maintainer. No prior Azure knowledge assumed.

---

## 0. The one thing to understand first

**All your telemetry lands in a single table called `customEvents`.**

Every event — activation, a git operation, a menu click, an error — is one row in that
table. You never need to join tables. Each row has these useful parts:

| Column | What it holds | Example |
|---|---|---|
| `timestamp` | When it happened (**always UTC**) | `2026-07-06 05:49` |
| `name` | Which event | `onlineeric.speedy-git-ext/operation` |
| `customDimensions` | A bag of string properties | `operation`, `outcome`, `surface`, `action`, `common.os`, `common.extversion`, `common.vscodemachineid` … |
| `customMeasurements` | A bag of numbers | `durationMs`, `activationMs`, `repoCount` |
| `client_City`, `client_StateOrProvince`, `client_CountryOrRegion` | Geo, auto-filled by Azure from the IP | `Auckland`, `New Zealand` |
| `user_Id` | The anonymous machine id (same value as `common.vscodemachineid`) | `52b98ec3…` |

Two facts that matter:

- **"A user" = one machine id.** It is an anonymous random id per install, not a person.
  Counting distinct users = counting distinct `user_Id` (or `common.vscodemachineid`).
- **Geo works even though the IP shows `0.0.0.0`.** Azure resolves the city/country from
  the IP at the moment of ingestion, then throws the IP away for privacy. So you get
  city-level location without storing anyone's address.

> ⚠️ **Data retention (read this before asking for "per year"):** the free tier keeps
> queryable data for **90 days** by default. Queries over `ago(365d)` will only return the
> last ~90 days until you either raise the retention period (Portal → your resource →
> *Usage and estimated costs* → *Data Retention*, up to 730 days — billed beyond 90 days)
> or export a monthly summary somewhere. For now, treat "per year" as "as far back as
> retention allows."

---

## 1. How to run a query (do this once, then reuse)

1. Go to **portal.azure.com** → open your resource **`speedygit-insight`**
   (Application Insights).
2. In the left menu, under **Monitoring**, click **Logs**.
3. Close any "Queries" pop-up. You now have a blank query editor.
4. Paste one of the queries below → click **Run**.
5. To keep a query: click **Save** → *Save as query* → give it a name
   (e.g. `Users - daily`). It's then one click away under **Queries** next time.
6. To turn a result into a chart on a dashboard: run it, click the **Chart** tab, then
   **Pin to dashboard**.

That's the whole workflow. Everything below is just queries you paste in step 4.

---

## 2. Your five questions — the queries

### Q1. How many distinct users per day / week / month

**Single numbers ("5 yesterday, 10 last week, 15 last month"):**

```kql
customEvents
| summarize
    Yesterday   = dcountif(user_Id, timestamp between (ago(2d) .. ago(1d))),
    Last7Days   = dcountif(user_Id, timestamp > ago(7d)),
    Last30Days  = dcountif(user_Id, timestamp > ago(30d))
```

**Trend over time (a line you can chart):**

```kql
customEvents
| where timestamp > ago(90d)
| summarize Users = dcount(user_Id) by bin(timestamp, 1d)
| render timechart
```

Change `bin(timestamp, 1d)` to `7d` for weekly or `30d` for monthly buckets.

**What it shows / what to understand:**
- `dcount` is a fast *estimate*; at your scale (tens of users) it is effectively exact.
- If you want a guaranteed-exact count, use `summarize by user_Id | count` instead.
- A flat or growing daily line = healthy adoption; a drop after a release = investigate.

---

### Q2. Where users come from (country / city) per period

```kql
customEvents
| where timestamp > ago(30d)          // change window as needed
| summarize Users = dcount(user_Id)
    by Country = client_CountryOrRegion, City = client_City
| order by Users desc
```

Gives you exactly the shape you asked for:

| Country | City | Users |
|---|---|---|
| New Zealand | Auckland | 3 |
| Australia | Melbourne | 6 |
| China | Shenzhen | 5 |

**By period (e.g. monthly):**

```kql
customEvents
| where timestamp > ago(180d)
| summarize Users = dcount(user_Id)
    by Month = format_datetime(startofmonth(timestamp), 'yyyy-MM'),
       Country = client_CountryOrRegion
| order by Month asc, Users desc
```

**What to understand:** location is derived from IP, so it's approximate (correct country,
usually correct city, sometimes the nearest big city). VPN users show their exit location.
Good enough for "which regions do I have users in" — not meant to be precise.

---

### Q3. Feature (git operation) frequency

These are your **`operation`** events — real git actions the user performed.

**Top features, all-time (within retention):**

```kql
customEvents
| where name endswith "/operation"
| summarize Count = count() by Feature = tostring(customDimensions.operation)
| order by Count desc
```

Result:

| Feature | Count |
|---|---|
| checkoutBranch | 2000 |
| mergeBranch | 1200 |
| … | … |

**Per month (a pivot table — features as rows, months as columns):**

```kql
customEvents
| where name endswith "/operation"
| where timestamp > ago(365d)
| summarize Count = count()
    by Feature = tostring(customDimensions.operation),
       Month = format_datetime(startofmonth(timestamp), 'yyyy-MM')
| evaluate pivot(Month, sum(Count), Feature)
```

**What to understand:**
- This ranking is your prioritization list: invest in the top, consider retiring the bottom.
- Add `| where customDimensions.outcome == "error"` to see which features *fail* most.

---

### Q4. UI interaction frequency (menus, buttons, panels)

Three event types feed your UI insight. Combine them into one ranked table:

```kql
customEvents
| where name has_any ("/uiInteraction", "/dialogOutcome", "/panelOpened")
| extend Surface = tostring(customDimensions.surface),
         Action  = tostring(customDimensions.action),
         Dialog  = tostring(customDimensions.dialog),
         Outcome = tostring(customDimensions.outcome),
         Trigger = tostring(customDimensions.trigger)
| extend Label = case(
        name endswith "/uiInteraction", strcat(Surface, " → ", Action),
        name endswith "/dialogOutcome", strcat("dialog:", Dialog, " (", Outcome, ")"),
        name endswith "/panelOpened",   strcat("openPanel (", Trigger, ")"),
        name)
| summarize Count = count() by Label
| order by Count desc
```

Result:

| Label | Count |
|---|---|
| worktreePanel → toggle | 1000 |
| toolbar → filter | 800 |
| dialog:merge (confirmed) | 240 |
| dialog:merge (cancelled) | 30 |
| … | … |

**Per month:** add
`, Month = format_datetime(startofmonth(timestamp),'yyyy-MM')` to the `summarize ... by`.

**What to understand:**
- High-count menu items = keep and polish; near-zero items = candidates to remove.
- **Dialog cancel vs confirm is gold:** a dialog with many `cancelled` and few `confirmed`
  means users open it, get confused, and back out — a UX problem worth fixing.

---

### Q5. Errors / "exceptions" — where they actually are

> **Important:** Speedy Git deliberately never sends stack traces or error messages
> (privacy). So the built-in **Failures** blade and the `exceptions` table will look
> **empty** — that is expected, not a bug. Your errors live in `customEvents` in two places:

**(a) Failed git operations** (from the `operation` event, `outcome = error`):

```kql
customEvents
| where name endswith "/operation"
| where customDimensions.outcome == "error"
| summarize Count = count()
    by Feature   = tostring(customDimensions.operation),
       ErrorCode = tostring(customDimensions.errorCode)
| order by Count desc
```

**(b) Background / internal errors** (the standalone `error` event — watcher, data loader,
repo discovery, etc.):

```kql
customEvents
| where name endswith "/error"
| summarize Count = count()
    by Area      = tostring(customDimensions.area),
       ErrorCode = tostring(customDimensions.errorCode)
| order by Count desc
```

**Error trend (are things getting worse?):**

```kql
customEvents
| where name endswith "/operation" and customDimensions.outcome == "error"
   or  name endswith "/error"
| summarize Errors = count() by bin(timestamp, 1d)
| render timechart
```

**What to understand:** you only get a *standardized error code* (e.g. `MERGE_CONFLICT`,
`NETWORK`, `UNKNOWN`) plus the area/feature — enough to see *what kind* of thing breaks and
*how often*, never *who* or *what content*. A spike in one code after a release points you
straight at a regression.

---

## 3. What I recommend you set up (in priority order)

You already proved KQL works. To go from "typing queries" to "a dashboard I glance at":

### ✅ Recommendation 1 — Build ONE Workbook (your dashboard)
A Workbook is a saved page holding all five answers above as live tiles, with a date-range
picker at the top. Write the queries once, read forever.

1. Left menu → **Workbooks** → **+ New**.
2. Click **Add** → **Add query**. Paste a query from section 2. Pick a visualization
   (grid for tables, time chart for trends). Click **Done Editing**.
3. Repeat **Add query** for each of the five questions.
4. Click **Add** → **Add parameter** → a *Time Range* parameter named `TimeRange`, then in
   each query replace `ago(30d)` with `{TimeRange}` so one picker controls the whole page.
5. Click **Save** (top) → name it `Speedy Git — Usage`. Pin it to your portal home if you like.

This is the "proper" home for your reporting. Ask me and I'll generate a ready-to-import
Workbook JSON with all five tiles pre-built.

### ✅ Recommendation 2 — Use the no-KQL "Usage" blades for the easy questions
Left menu → **Usage** → **Users** and **Events**. These read `customEvents` through a
point-and-click UI and give you daily/weekly/monthly active users, retention, and an event
ranking **without any query**. Great for a quick look; use the Workbook for the exact tables.

### ✅ Recommendation 3 — Add one alert for error spikes
Left menu → **Alerts** → **Create alert rule** → Condition = **Custom log search** → paste:

```kql
customEvents
| where name endswith "/error"
   or (name endswith "/operation" and customDimensions.outcome == "error")
```

Set it to fire when the count over 1 hour is greater than a threshold you pick, and add your
email. Now problems come to you instead of you having to look.

### 🔶 Recommendation 4 — Decide on retention if you want long-term trends
Default is 90 days. If year-over-year matters, raise **Data Retention** (up to 730 days) or
save a monthly summary query and copy the numbers into a spreadsheet each month.

### 🔶 Recommendation 5 — Sanity-check the free tier
Left menu → **Usage and estimated costs**. Your event volume is tiny and should stay inside
the free monthly ingestion grant. Glance here occasionally so a runaway never surprises you.

---

## 4. Quick reference — copy/paste cheat sheet

| I want… | Paste this `customEvents` filter |
|---|---|
| Distinct users last 30 days | `\| summarize dcount(user_Id) where timestamp > ago(30d)` |
| Users by country | `\| summarize dcount(user_Id) by client_CountryOrRegion` |
| Top git features | `\| where name endswith "/operation" \| summarize count() by tostring(customDimensions.operation)` |
| Top UI actions | `\| where name endswith "/uiInteraction" \| summarize count() by tostring(customDimensions.action)` |
| Errors by code | `\| where customDimensions.outcome == "error" \| summarize count() by tostring(customDimensions.errorCode)` |
| Editor / OS mix | `\| summarize dcount(user_Id) by tostring(customDimensions["common.appName"]), tostring(customDimensions["common.os"])` |

> Tip: property keys with a dot (like `common.appName`) must use bracket syntax:
> `customDimensions["common.appName"]`. Keys without a dot can use either
> `customDimensions.operation` or `customDimensions["operation"]`.
