# Automatic Business Insights

Upgrade the existing Insights tab into a full auto-analysis report built from the sales, billing and expense data already in the app. Stays in the Pro and Premium plans, exactly as it is priced today (Basic users keep seeing the locked screen).

## What the owner sees

**Period switcher** at the top: Day / Week / Month. Everything below recalculates for the chosen period and compares it to the previous one.

**1. Summary cards**
- Sales for the period with the change vs the previous period ("Sales up 15% this week vs last week")
- Orders count and average bill value, each with its own change
- Expenses for the period with change
- Profit and profit margin for the period

**2. Plain-language daily/weekly report**
A short list of readable sentences generated from the numbers, e.g.
- "Sales are up 15% this week compared to last week."
- "Weekend sales are 30% higher than weekdays."
- "Kingfisher brought the most revenue: 120 pints, Rs 24,000."
- "Tuesday was the quietest day of the week."
- "Spending on Maintenance is 60% above your usual average."
Sentences only appear when there is enough data to support them; no filler.

**3. Best and worst performers**
- Top sellers by revenue and by quantity
- Slow movers: items with the lowest sales in the period (including items that sold nothing)
- Least profitable items, flagging any sold below cost

**4. Peak hours and days**
- Busiest hour bands from bill timestamps, shown as a simple bar strip (e.g. 8 PM to 10 PM is your peak)
- Busiest weekday, quietest weekday, weekend vs weekday comparison

**5. Expense pattern alerts**
Each expense category is compared to its own historical average. Categories running noticeably above normal are flagged in amber with the amount and percentage above average; unusually low ones are noted too.

**6. Profit margin insights**
Table of items ranked by profit margin percentage next to sales volume, so the owner can see "high margin but low volume" vs "high volume but thin margin". Highest-margin and highest-volume items called out at the top.

**7. Insight history**
A snapshot of each generated report (the numbers plus the sentences) is saved automatically once per day, keeping the last 90 entries. A History section lists past reports, newest first, expandable to read the sentences from that day, so trends can be compared over time. History is stored with the rest of the app data on the device, same as sales and expenses today.

## Empty and thin data

With no invoices at all, the current empty state stays. With some data but not enough for a comparison (e.g. first week of use), comparison lines are hidden rather than showing misleading percentages.

## Technical notes

- Rewrite `src/hooks/useInsights.ts` into a period-aware analytics engine: period resolution (day/week/month with previous-period ranges), product aggregation with margin, hour-of-day and weekday histograms from `invoice.timestamp`, expense-category averages from `db.expenses`, and a sentence generator producing typed insight strings with severity (good / warning / neutral).
- Rebuild `src/views/InsightsView.tsx` with the period switcher and the seven sections; keep the existing dark zinc/amber styling, Font Awesome icons and card patterns already used in the file.
- Add a small `src/hooks/useInsightHistory.ts` persisting snapshots under a dedicated localStorage key (separate from `TAPTRACK_OS_STORE_V3` so backup/restore of core data is untouched), deduped by date, capped at 90 entries.
- No schema or backend changes; no new dependencies.
- Gating is unchanged: `insights` already maps to `pro` in `FEATURE_REQUIREMENT`, and `/_authenticated/index.tsx` already renders `LockedFeature` for Basic.
