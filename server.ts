#!/usr/bin/env node
/**
 * ESPN Soccer MCP Server
 * Provides access to ESPN's hidden API for soccer league or tournaments
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, TextContent } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import crypto from 'crypto';

// Soccer Leagues and Tournaments
const LEAGUES = {
  'premier-league': { id: 'eng.1', name: 'English Premier League' },
  'la-liga': { id: 'esp.1', name: 'Spanish La Liga' },
  'bundesliga': { id: 'ger.1', name: 'German Bundesliga' },
  'serie-a': { id: 'ita.1', name: 'Italian Serie A' },
  'ligue-1': { id: 'fra.1', name: 'French Ligue 1' },
  'champions-league': { id: 'uefa.champions', name: 'UEFA Champions League' },
  'europa-league': { id: 'uefa.europa', name: 'UEFA Europa League' },
  'world-cup': { id: 'fifa.world', name: 'FIFA World Cup' },
};

const tools = [
  {
    name: 'get-scoreboard',
    description: 'Get current scores and fixtures for a soccer league or tournament. Returns live scores, upcoming matches, and recent results.',
    inputSchema: {
      type: 'object',
      properties: {
        league: {
          type: 'string',
          description: 'League identifier',
          enum: Object.keys(LEAGUES),
        },
        date: {
          type: 'string',
          description: 'Optional date in YYYYMMDD format. If not provided, returns current/upcoming matches.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of matches to return (default: 10, max: 20)',
        },
      },
      required: ['league'],
    },
  },
  {
    name: 'get-match-summary',
    description: 'Get detailed summary of a specific match including lineups, statistics, and events.',
    inputSchema: {
      type: 'object',
      properties: {
        league: {
          type: 'string',
          description: 'League identifier',
          enum: Object.keys(LEAGUES),
        },
        eventId: {
          type: 'string',
          description: 'Match/event ID from scoreboard',
        },
      },
      required: ['league', 'eventId'],
    },
  },
  {
    name: 'get-league-news',
    description: 'Get latest news for a soccer league or tournament.',
    inputSchema: {
      type: 'object',
      properties: {
        league: {
          type: 'string',
          description: 'League identifier',
          enum: Object.keys(LEAGUES),
        },
        limit: {
          type: 'number',
          description: 'Maximum number of news articles to return (default: 10)',
        },
      },
      required: ['league'],
    },
  },
  {
    name: 'get-team-info',
    description: 'Get information about a specific team in a league.',
    inputSchema: {
      type: 'object',
      properties: {
        league: {
          type: 'string',
          description: 'League identifier',
          enum: Object.keys(LEAGUES),
        },
        teamId: {
          type: 'string',
          description: 'Team ID',
        },
      },
      required: ['league', 'teamId'],
    },
  },
  {
    name: 'get-teams',
    description: 'Get all teams in a soccer league or tournament.',
    inputSchema: {
      type: 'object',
      properties: {
        league: {
          type: 'string',
          description: 'League identifier',
          enum: Object.keys(LEAGUES),
        },
      },
      required: ['league'],
    },
  },
  {
    name: 'list-leagues',
    description: 'List all available soccer leagues and tournaments.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get-standings',
    description: 'Get current league table/standings showing team positions. Use to identify title races, relegation battles, and European qualification spots.',
    inputSchema: {
      type: 'object',
      properties: {
        league: {
          type: 'string',
          description: 'League identifier',
          enum: Object.keys(LEAGUES),
        },
      },
      required: ['league'],
    },
  },
];

// Helper functions
async function fetchESPN(path: string): Promise<any> {
  const url = `http://site.api.espn.com${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.statusText}`);
  }
  return response.json();
}

async function getScoreboard(league: string, date?: string, limit: number = 10): Promise<any> {
  const leagueInfo = LEAGUES[league as keyof typeof LEAGUES];
  if (!leagueInfo) throw new Error(`Unknown league: ${league}`);

  let path = `/apis/site/v2/sports/soccer/${leagueInfo.id}/scoreboard`;
  if (date) {
    path += `?dates=${date}`;
  }

  const data = await fetchESPN(path);
  const maxLimit = Math.min(limit, 20); // Cap at 20 matches

  return {
    league: leagueInfo.name,
    leagueId: leagueInfo.id,
    events: data.events?.slice(0, maxLimit).map((event: any) => ({
      id: event.id,
      name: event.name,
      shortName: event.shortName,
      date: event.date,
      status: event.status.type.description,
      state: event.status.type.state,
      venue: event.competitions?.[0]?.venue?.fullName,
      homeTeam: {
        id: event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.id,
        name: event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName,
        score: event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.score,
      },
      awayTeam: {
        id: event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away')?.id,
        name: event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName,
        score: event.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away')?.score,
      },
    })) || [],
    totalEvents: data.events?.length || 0,
    showing: Math.min(data.events?.length || 0, maxLimit),
  };
}

async function getMatchSummary(league: string, eventId: string): Promise<any> {
  const leagueInfo = LEAGUES[league as keyof typeof LEAGUES];
  if (!leagueInfo) throw new Error(`Unknown league: ${league}`);

  const path = `/apis/site/v2/sports/soccer/${leagueInfo.id}/summary?event=${eventId}`;
  const data = await fetchESPN(path);

  return {
    eventId,
    match: {
      name: data.header?.competitions?.[0]?.competitors?.map((c: any) => c.team.displayName).join(' vs '),
      date: data.header?.competitions?.[0]?.date,
      status: data.header?.competitions?.[0]?.status?.type?.description,
      venue: data.header?.competitions?.[0]?.venue?.fullName,
    },
    score: {
      home: {
        name: data.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName,
        score: data.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'home')?.score,
      },
      away: {
        name: data.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName,
        score: data.header?.competitions?.[0]?.competitors?.find((c: any) => c.homeAway === 'away')?.score,
      },
    },
    commentary: data.commentary?.slice(0, 5).map((c: any) => ({
      time: c.time?.displayValue,
      text: c.text,
    })) || [],
    attendance: data.gameInfo?.attendance,
  };
}

async function getLeagueNews(league: string, limit: number = 5): Promise<any> {
  const leagueInfo = LEAGUES[league as keyof typeof LEAGUES];
  if (!leagueInfo) throw new Error(`Unknown league: ${league}`);

  const path = `/apis/site/v2/sports/soccer/${leagueInfo.id}/news?limit=${Math.min(limit, 5)}`;
  const data = await fetchESPN(path);

  return {
    league: leagueInfo.name,
    articles: data.articles?.map((article: any) => ({
      headline: article.headline,
      description: article.description?.substring(0, 200), // Limit description length
      published: article.published,
      link: article.links?.web?.href,
    })) || [],
  };
}

async function getTeamInfo(league: string, teamId: string): Promise<any> {
  const leagueInfo = LEAGUES[league as keyof typeof LEAGUES];
  if (!leagueInfo) throw new Error(`Unknown league: ${league}`);

  const path = `/apis/site/v2/sports/soccer/${leagueInfo.id}/teams/${teamId}`;
  const data = await fetchESPN(path);

  return {
    team: {
      id: data.team?.id,
      name: data.team?.displayName,
      abbreviation: data.team?.abbreviation,
      location: data.team?.location,
      color: data.team?.color,
      logos: data.team?.logos?.map((l: any) => l.href),
      standingSummary: data.team?.standingSummary,
    },
  };
}

async function getTeams(league: string): Promise<any> {
  const leagueInfo = LEAGUES[league as keyof typeof LEAGUES];
  if (!leagueInfo) throw new Error(`Unknown league: ${league}`);

  const path = `/apis/site/v2/sports/soccer/${leagueInfo.id}/teams`;
  const data = await fetchESPN(path);

  return {
    league: leagueInfo.name,
    teams: data.sports?.[0]?.leagues?.[0]?.teams?.map((t: any) => ({
      id: t.team.id,
      name: t.team.displayName,
      shortName: t.team.shortDisplayName,
      abbreviation: t.team.abbreviation,
      logo: t.team.logos?.[0]?.href,
    })) || [],
  };
}

async function getStandings(league: string): Promise<any> {
  const leagueInfo = LEAGUES[league as keyof typeof LEAGUES];
  if (!leagueInfo) throw new Error(`Unknown league: ${league}`);

  const path = `/apis/v2/sports/soccer/${leagueInfo.id}/standings`;
  const data = await fetchESPN(path);

  return {
    league: leagueInfo.name,
    standings: data.children?.[0]?.standings?.entries?.map((entry: any) => ({
      position: entry.stats?.find((s: any) => s.name === 'rank')?.value,
      team: entry.team?.displayName,
      teamId: entry.team?.id,
      played: entry.stats?.find((s: any) => s.name === 'gamesPlayed')?.value,
      wins: entry.stats?.find((s: any) => s.name === 'wins')?.value,
      losses: entry.stats?.find((s: any) => s.name === 'losses')?.value,
      points: entry.stats?.find((s: any) => s.name === 'points')?.value,
      pointDifferential: entry.stats?.find((s: any) => s.name === 'pointDifferential')?.value,
    })) || [],
  };
}

function listLeagues(): any {
  return {
    leagues: Object.entries(LEAGUES).map(([key, value]) => ({
      id: key,
      leagueCode: value.id,
      name: value.name,
    })),
  };
}

// Logging
function log(level: string, event: string, data: any = {}) {
  process.stderr.write(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...data }) + '\n');
}

class ESPNSoccerMCPServer {
  private sessionServers = new Map();
  private static SESSION_TTL_MS = 3600000;
  private static MAX_SESSIONS = 100;

  private createServer(): Server {
    const server = new Server(
      { name: 'espn-soccer', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      try {
        const { name, arguments: args } = request.params;
        let result: any;

        switch (name) {
          case 'get-scoreboard':
            result = await getScoreboard(args!.league, args?.date, args?.limit);
            break;
          case 'get-match-summary':
            result = await getMatchSummary(args!.league, args!.eventId);
            break;
          case 'get-league-news':
            result = await getLeagueNews(args!.league, args?.limit);
            break;
          case 'get-team-info':
            result = await getTeamInfo(args!.league, args!.teamId);
            break;
          case 'get-teams':
            result = await getTeams(args!.league);
            break;
          case 'list-leagues':
            result = listLeagues();
            break;
          case 'get-standings':
            result = await getStandings(args!.league);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) } as TextContent],
        };
      } catch (error: any) {
        log('error', 'tool_error', { tool: request.params.name, error: error.message });
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: error.message }, null, 2) } as TextContent,
          ],
          isError: true,
        };
      }
    });

    return server;
  }

  async run() {
    const app = express();
    app.use(express.json());

    app.get('/health', (_req, res) => {
      res.status(200).json({ status: 'ok', service: 'espn-soccer' });
    });

    app.get('/ready', (_req, res) => {
      res.status(200).json({ status: 'ready', service: 'espn-soccer' });
    });

    app.use((req, _res, next) => {
      const accept = (req.headers.accept || '').split(',').map((v) => v.trim());
      if (!accept.includes('application/json')) accept.push('application/json');
      if (!accept.includes('text/event-stream')) accept.push('text/event-stream');
      req.headers.accept = accept.join(', ');
      next();
    });

    app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string;

      if (!sessionId && req.body?.method === 'initialize') {
        if (this.sessionServers.size >= ESPNSoccerMCPServer.MAX_SESSIONS) {
          return res.status(503).json({ error: 'Session capacity reached' });
        }

        const newSessionId = crypto.randomBytes(16).toString('hex');
        const server = this.createServer();
        const transport = new StreamableHTTPServerTransport({
          enableJsonResponse: true,
          sessionIdGenerator: () => newSessionId,
        });

        server.oninitialized = () =>
          log('info', 'session_initialized', { session_id: newSessionId.substring(0, 8) });
        server.onclose = () => {
          this.sessionServers.delete(newSessionId);
          log('info', 'session_closed', { session_id: newSessionId.substring(0, 8) });
        };

        await server.connect(transport as Transport);
        this.sessionServers.set(newSessionId, { server, transport, lastActivity: Date.now() });
        res.setHeader('mcp-session-id', newSessionId);
        await transport.handleRequest(req, res, req.body);
      } else if (sessionId) {
        const session = this.sessionServers.get(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        session.lastActivity = Date.now();
        await session.transport.handleRequest(req, res, req.body);
      } else {
        res.status(400).json({ error: 'Session ID required' });
      }
    });

    app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string;
      if (!sessionId) return res.status(400).json({ error: 'Session ID required' });
      const session = this.sessionServers.get(sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      session.lastActivity = Date.now();
      await session.transport.handleRequest(req, res);
    });

    const port = parseInt(process.env.PORT || '8080', 10);
    app.listen(port, () => log('info', 'server_start', { port }));
  }
}

new ESPNSoccerMCPServer().run();
