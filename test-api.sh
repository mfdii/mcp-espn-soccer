#!/bin/bash
set -e

BASE_URL="${ESPN_SOCCER_URL:-http://localhost:8080}"

echo "ESPN Soccer MCP Server - Complete Tool Test"
echo "============================================="
echo ""

# Initialize session
echo "Initializing session..."
SESSION_ID=$(curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -v \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' 2>&1 | grep -i "< mcp-session-id:" | cut -d':' -f2 | tr -d ' \r')

echo "Session ID: $SESSION_ID"
echo ""

# Test 1: Health check
echo "1. Health Check"
curl -sk "${BASE_URL}/health" | jq .
echo ""

# Test 2: List tools
echo "2. List Tools"
curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq -r '.result.tools[] | .name'
echo ""

# Test 3: List leagues
echo "3. List Leagues"
curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list-leagues","arguments":{}}}' | jq -r '.result.content[0].text' | jq -r '.leagues[] | "\(.id): \(.name)"'
echo ""

# Test 4: Get teams
echo "4. Get Premier League Teams"
TEAMS_RESPONSE=$(curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get-teams","arguments":{"league":"premier-league"}}}')
echo "$TEAMS_RESPONSE" | jq -r '.result.content[0].text' | jq '{league, teamCount: (.teams | length), firstTeam: .teams[0]}'
TEAM_ID=$(echo "$TEAMS_RESPONSE" | jq -r '.result.content[0].text' | jq -r '.teams[0].id')
echo ""

# Test 5: Get team info
echo "5. Get Team Info (Team ID: $TEAM_ID)"
curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\",\"params\":{\"name\":\"get-team-info\",\"arguments\":{\"league\":\"premier-league\",\"teamId\":\"$TEAM_ID\"}}}" | jq -r '.result.content[0].text' | jq .
echo ""

# Test 6: Get standings
echo "6. Get Premier League Standings (Top 5)"
curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get-standings","arguments":{"league":"premier-league"}}}' | jq -r '.result.content[0].text' | jq '.standings[0:5]'
echo ""

# Test 7: Get scoreboard
echo "7. Get Premier League Scoreboard"
curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get-scoreboard","arguments":{"league":"premier-league","limit":3}}}' | jq -r '.result.content[0].text' | jq '{league, totalEvents, showing, matches: .events[0:3] | map({name, date, status})}'
echo ""

# Test 8: Get league news
echo "8. Get Premier League News (Latest 2)"
curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"get-league-news","arguments":{"league":"premier-league","limit":2}}}' | jq -r '.result.content[0].text' | jq '.articles[0:2] | map({headline, published})'
echo ""

# Test 9: Get World Cup teams
echo "9. Get FIFA World Cup Teams (Sample)"
curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"get-teams","arguments":{"league":"world-cup"}}}' | jq -r '.result.content[0].text' | jq '{league, teamCount: (.teams | length), sampleTeams: .teams[0:5] | map(.name)}'
echo ""

echo "============================================="
echo "All tests complete!"
