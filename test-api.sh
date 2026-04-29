#!/bin/bash
set -e

BASE_URL="${ESPN_SOCCER_URL:-http://localhost:8080}"

echo "Testing ESPN Soccer MCP Server"
echo "==============================="
echo ""

# Test health endpoint
echo "1. Health Check"
curl -sk "${BASE_URL}/health" | jq .
echo ""

# Initialize session and get session ID
echo "2. Initialize MCP Session"
SESSION_ID=$(curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -v \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' 2>&1 | grep -i "< mcp-session-id:" | cut -d':' -f2 | tr -d ' \r')

echo "Session ID: $SESSION_ID"
echo ""

# List tools
echo "3. List Tools"
curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq -r '.result.tools[] | .name'
echo ""

# List leagues
echo "4. List Leagues"
curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list-leagues","arguments":{}}}' | jq -r '.result.content[0].text' | jq -r '.leagues[] | "\(.id): \(.name)"'
echo ""

# Get Premier League scoreboard
echo "5. Get Premier League Scoreboard"
curl -sk -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get-scoreboard","arguments":{"league":"premier-league"}}}' | jq -r '.result.content[0].text' | jq '{league, totalEvents, firstMatch: .events[0].name}'
echo ""

echo "==============================="
echo "Tests complete!"
