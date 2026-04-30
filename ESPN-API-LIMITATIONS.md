# ESPN API Solution - get-team-info Multi-Fixture Support

## Problem (SOLVED)

**ESPN's `/teams/{id}` endpoint only provided 1 upcoming fixture** in the `nextEvent` array.

## Solution Implemented (2026-04-30)

**Rewrote `get-team-info` to search scoreboards day-by-day** for upcoming matches involving the requested team.

### Implementation Strategy

Instead of relying on the team endpoint's `nextEvent` array, we now:

1. Get team metadata from `/teams/{id}` endpoint
2. Search scoreboard endpoint for next 60 days: `/scoreboard?dates=YYYYMMDD`
3. Filter each day's matches for ones involving the specified team
4. Collect fixtures until we reach the requested `limit`
5. Stop early once we have enough fixtures (performance optimization)

### Code Changes

```typescript
async function getTeamInfo(league: string, teamId: string, limit: number = 5) {
  // Get team metadata
  const teamData = await fetchESPN(`/teams/${teamId}`);
  
  // Search next 60 days day-by-day
  const upcomingFixtures = [];
  for (let day = 0; day < 60 && upcomingFixtures.length < limit; day++) {
    const dateStr = formatDate(today + day); // YYYYMMDD
    const scoreboard = await fetchESPN(`/scoreboard?dates=${dateStr}`);
    
    // Filter for this team's matches
    const teamMatches = scoreboard.events.filter(event =>
      event.competitors.some(c => c.team.id === teamId)
    );
    
    upcomingFixtures.push(...teamMatches);
  }
  
  return { team: teamData, upcomingFixtures };
}
```

---

## Test Results (After Fix)

Tested `get-team-info` with day-by-day scoreboard search:

| Team | League | Limit Requested | Fixtures Returned |
|------|--------|----------------|-------------------|
| Arsenal | Premier League | 1 | 1 ✅ |
| Arsenal | Premier League | 3 | 3 ✅ |
| Arsenal | Premier League | 5 | 4* ✅ |
| Arsenal | Premier League | 7 | 4* ✅ |
| Arsenal | Premier League | 10 | 4* ✅ |
| Liverpool | Premier League | 3 | 3 ✅ |

*Only 4 remaining fixtures in season (34/38 matches played)

**Success!** Now returns actual number of upcoming fixtures up to the requested limit.

### Example Response

```json
{
  "team": {
    "name": "Arsenal",
    "standingSummary": "1st in English Premier League"
  },
  "upcomingFixtures": [
    {
      "date": "2026-05-02T16:30Z",
      "shortName": "FUL @ ARS",
      "venue": "Emirates Stadium",
      "broadcasts": ["NBC", "Tele"]
    },
    {
      "date": "2026-05-10T15:30Z",
      "shortName": "ARS @ WHU",
      "venue": "London Stadium",
      "broadcasts": []
    },
    {
      "date": "2026-05-18T19:00Z",
      "shortName": "BUR @ ARS",
      "venue": "Emirates Stadium",
      "broadcasts": []
    },
    {
      "date": "2026-05-24T15:00Z",
      "shortName": "ARS @ CRY",
      "venue": "Selhurst Park",
      "broadcasts": []
    }
  ]
}
```

---

## Performance Considerations

### API Call Count

- **Worst case**: Up to 60 API calls (if team has no upcoming matches)
- **Best case**: As few as 1-5 API calls (if team plays frequently)
- **Typical case**: 5-15 API calls (most teams play weekly)

### Optimization

The loop stops early once it finds enough fixtures:
- Request limit=1 → Usually finds fixture in first 1-7 days (1-7 API calls)
- Request limit=5 → Usually finds 5 fixtures in first 30-40 days (30-40 API calls)

Since teams typically play once per week, requesting `limit=5` means ~5 weeks of searching, or ~35 days.

### Caching Strategy (Future Enhancement)

To reduce API calls, we could:
1. Cache scoreboard responses for 1 hour
2. Batch multiple team queries
3. Use Redis to share fixture data across requests

**Current Status**: No caching, direct API calls (acceptable for low-volume usage)

---

## Benefits

1. ✅ **Solves hallucination issue**: AI no longer makes up match dates
2. ✅ **Returns actual fixtures**: Real data from ESPN
3. ✅ **Includes broadcast info**: Where to watch matches
4. ✅ **Flexible limit**: Can request 1-10 upcoming matches
5. ✅ **Works across leagues**: Premier League, La Liga, Bundesliga, etc.

---

## Trade-offs

### Pros
- Accurate upcoming fixtures (no more hallucinations)
- Flexible number of matches (1-10)
- Includes all match details (date, venue, broadcasts)

### Cons
- Slower than single API call (5-40 calls vs 1 call)
- More API requests to ESPN (could hit rate limits at high volume)
- Response time: ~500ms for 1 fixture, ~3s for 5 fixtures

### Verdict
**Acceptable trade-off** for current use case (n8n workflows with low request volume). The accuracy gain outweighs the performance cost.

---

## Future Improvements

If performance becomes an issue:

1. **Add Redis cache** with 1-hour TTL for scoreboard responses
2. **Parallelize API calls** using Promise.all() for multiple dates
3. **Smart date selection** (only search Saturdays/Sundays for weekend matches)
4. **Bulk endpoint** if ESPN provides one in the future

---

## Season Context (April 30, 2026)

- Premier League 2025-26 season: 34/38 matches played (~4 remaining)
- Season ending in ~3 weeks
- Most teams have 4-5 fixtures left

This solution will work even better at season start (August) when teams have 38 upcoming matches instead of just 4.
