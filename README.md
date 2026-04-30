# ESPN Soccer MCP Server

Model Context Protocol (MCP) server for accessing ESPN's hidden API for soccer leagues and tournaments.

## Features

Access to top soccer leagues and international tournaments:
- **Premier League** (England)
- **La Liga** (Spain)
- **Bundesliga** (Germany)
- **Serie A** (Italy)
- **Ligue 1** (France)
- **Champions League** (UEFA)
- **Europa League** (UEFA)
- **FIFA World Cup**

## Available Tools

### 1. list-leagues
List all available soccer leagues and tournaments.

```json
{
  "name": "list-leagues",
  "arguments": {}
}
```

### 2. get-scoreboard
Get current scores and fixtures for a league, including TV broadcast channels and betting odds.

```json
{
  "name": "get-scoreboard",
  "arguments": {
    "league": "premier-league",
    "date": "20260427",  // Optional: YYYYMMDD format
    "limit": 10          // Optional: Max matches to return (default: 10, max: 20)
  }
}
```

**Response includes:**
- Match details (teams, scores, date, venue)
- **Broadcast channels** (e.g., `["NBC Sports", "Peacock"]`) - where to watch
- **Match odds** (over/under and favorite) - for assessing match excitement
  - `overUnder > 3.5` → High-scoring match expected
  - `overUnder < 2.5` → Defensive battle expected
  - Close odds → Evenly matched teams

### 3. get-teams
Get all teams in a league.

```json
{
  "name": "get-teams",
  "arguments": {
    "league": "premier-league"
  }
}
```

### 4. get-team-info
Get detailed information about a specific team.

```json
{
  "name": "get-team-info",
  "arguments": {
    "league": "premier-league",
    "teamId": "360"  // Manchester United
  }
}
```

### 5. get-match-summary
Get detailed match summary including lineups and statistics.

```json
{
  "name": "get-match-summary",
  "arguments": {
    "league": "premier-league",
    "eventId": "740932"
  }
}
```

### 6. get-league-news
Get latest news for a league.

```json
{
  "name": "get-league-news",
  "arguments": {
    "league": "premier-league",
    "limit": 10  // Optional, default: 10
  }
}
```

## League Identifiers

| League/Tournament | ID | ESPN Code |
|--------|----|-----------| 
| Premier League | `premier-league` | `eng.1` |
| La Liga | `la-liga` | `esp.1` |
| Bundesliga | `bundesliga` | `ger.1` |
| Serie A | `serie-a` | `ita.1` |
| Ligue 1 | `ligue-1` | `fra.1` |
| Champions League | `champions-league` | `uefa.champions` |
| Europa League | `europa-league` | `uefa.europa` |
| FIFA World Cup | `world-cup` | `fifa.world` |

## Deployment

Deployed to OpenShift in the `n8n` namespace:

- **URL**: `https://your-server.example.com/mcp`
- **Health Check**: `https://your-server.example.com/health`
- **Replicas**: 1 pod

### Deploy to OpenShift

```bash
cd .
./deploy.sh
```

### Manual Deployment

```bash
# Create ConfigMap
oc create configmap espn-soccer-server --from-file=server.ts=server.ts -n n8n

# Apply resources
oc apply -f k8s/imagestream.yaml
oc apply -f k8s/buildconfig.yaml
oc start-build espn-soccer -n n8n --follow
oc apply -f k8s/service.yaml
oc apply -f k8s/deployment.yaml
oc apply -f k8s/route.yaml
```

## Testing

Run the test script:

```bash
./test-api.sh
```

Or test manually:

```bash
# Initialize session
SESSION_ID=$(curl -sk -X POST https://your-server.example.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -v \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' 2>&1 | grep -i "< mcp-session-id:" | cut -d':' -f2 | tr -d ' \r')

# Get Premier League scoreboard
curl -sk -X POST https://your-server.example.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get-scoreboard","arguments":{"league":"premier-league"}}}'
```

## n8n Integration

Add as an MCP Client tool in your n8n workflow:

1. **Endpoint URL**: `https://your-server.example.com/mcp`
2. The MCP Client will automatically discover available tools
3. Use in AI Agent workflows to get live soccer data

Example use cases:
- "What are today's Premier League fixtures?"
- "Get me the latest Champions League scores"
- "Show me World Cup standings"
- "Get news about La Liga"

## Architecture

- **Runtime**: Node.js 20 (Alpine Linux)
- **Framework**: Express.js for HTTP transport
- **MCP SDK**: @modelcontextprotocol/sdk with StreamableHTTPServerTransport
- **API**: ESPN hidden API (http://site.api.espn.com)
- **TypeScript**: Executed with tsx

## Monitoring

Check pod status:
```bash
oc get pods -n n8n -l app=espn-soccer
```

View logs:
```bash
oc logs -n n8n -l app=espn-soccer --tail=50 -f
```

## Credits

- ESPN API documentation: https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b
- Built following the MCP Date-Time server pattern
