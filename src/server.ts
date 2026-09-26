import express from 'express';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { z } from 'zod';

const LEAGUES = {
  'premier-league': { id: 'eng.1', name: 'English Premier League' },
  'la-liga': { id: 'esp.1', name: 'Spanish La Liga' },
  'bundesliga': { id: 'ger.1', name: 'German Bundesliga' },
  'serie-a': { id: 'ita.1', name: 'Italian Serie A' },
  'ligue-1': { id: 'fra.1', name: 'French Ligue 1' },
  'scottish-premiership': { id: 'sco.1', name: 'Scottish Premiership' },
  'champions-league': { id: 'uefa.champions', name: 'UEFA Champions League' },
  'europa-league': { id: 'uefa.europa', name: 'UEFA Europa League' },
  'world-cup': { id: 'fifa.world', name: 'FIFA World Cup' },
} as const;

type LeagueKey = keyof typeof LEAGUES;
const leagueKeys = Object.keys(LEAGUES) as [LeagueKey, ...LeagueKey[]];
const leagueSchema = z.enum(leagueKeys);

function log(level: string, event: string, data: Record<string, unknown> = {}) {
  process.stderr.write(JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...data }) + '\n');
}

async function fetchESPN(path: string): Promise<any> {
  const url = `http://site.api.espn.com${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.statusText}`);
  }
  return response.json();
}

async function getScoreboard(league: LeagueKey, date?: string, limit: number = 10): Promise<any> {
  const leagueInfo = LEAGUES[league];
  let path = `/apis/site/v2/sports/soccer/${leagueInfo.id}/scoreboard`;
  if (date) path += `?dates=${date}`;

  const data = await fetchESPN(path);
  const maxLimit = Math.min(limit, 20);

  return {
    league: leagueInfo.name,
    leagueId: leagueInfo.id,
    events: data.events?.slice(0, maxLimit).map((event: any) => {
      const competition = event.competitions?.[0];
      const odds = competition?.odds?.[0];
      return {
        id: event.id,
        name: event.name,
        shortName: event.shortName,
        date: event.date,
        status: event.status.type.description,
        state: event.status.type.state,
        venue: competition?.venue?.fullName,
        broadcasts: competition?.broadcasts?.map((b: any) => b.names).flat().filter(Boolean) || [],
        matchOdds: odds ? { overUnder: odds.overUnder, favorite: odds.details } : null,
        homeTeam: {
          id: competition?.competitors?.find((c: any) => c.homeAway === 'home')?.id,
          name: competition?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName,
          score: competition?.competitors?.find((c: any) => c.homeAway === 'home')?.score,
        },
        awayTeam: {
          id: competition?.competitors?.find((c: any) => c.homeAway === 'away')?.id,
          name: competition?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName,
          score: competition?.competitors?.find((c: any) => c.homeAway === 'away')?.score,
        },
      };
    }) || [],
    totalEvents: data.events?.length || 0,
    showing: Math.min(data.events?.length || 0, maxLimit),
  };
}

async function getMatchSummary(league: LeagueKey, eventId: string): Promise<any> {
  const leagueInfo = LEAGUES[league];
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

async function getLeagueNews(league: LeagueKey, limit: number = 5): Promise<any> {
  const leagueInfo = LEAGUES[league];
  const path = `/apis/site/v2/sports/soccer/${leagueInfo.id}/news?limit=${Math.min(limit, 5)}`;
  const data = await fetchESPN(path);

  return {
    league: leagueInfo.name,
    articles: data.articles?.map((article: any) => ({
      headline: article.headline,
      description: article.description?.substring(0, 200),
      published: article.published,
      link: article.links?.web?.href,
    })) || [],
  };
}

async function getTeamInfo(league: LeagueKey, teamId: string, limit: number = 5): Promise<any> {
  const leagueInfo = LEAGUES[league];
  const teamPath = `/apis/site/v2/sports/soccer/${leagueInfo.id}/teams/${teamId}`;
  const teamData = await fetchESPN(teamPath);

  const maxLimit = Math.min(limit, 10);
  const upcomingFixtures: any[] = [];
  const today = new Date();

  for (let day = 0; day < 60 && upcomingFixtures.length < maxLimit; day++) {
    const searchDate = new Date(today);
    searchDate.setDate(today.getDate() + day);
    const dateStr = searchDate.toISOString().split('T')[0].replace(/-/g, '');

    try {
      const scoreboardPath = `/apis/site/v2/sports/soccer/${leagueInfo.id}/scoreboard?dates=${dateStr}`;
      const scoreboardData = await fetchESPN(scoreboardPath);

      const teamMatches = scoreboardData.events?.filter((event: any) => {
        const competitors = event.competitions?.[0]?.competitors || [];
        return competitors.some((c: any) => c.team?.id === teamId);
      }) || [];

      for (const event of teamMatches) {
        if (upcomingFixtures.length >= maxLimit) break;
        const competition = event.competitions?.[0];
        upcomingFixtures.push({
          id: event.id,
          name: event.name,
          shortName: event.shortName,
          date: event.date,
          status: event.status?.type?.description,
          homeTeam: {
            id: competition?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.id,
            name: competition?.competitors?.find((c: any) => c.homeAway === 'home')?.team?.displayName,
          },
          awayTeam: {
            id: competition?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.id,
            name: competition?.competitors?.find((c: any) => c.homeAway === 'away')?.team?.displayName,
          },
          venue: competition?.venue?.fullName,
          broadcasts: competition?.broadcasts?.map((b: any) => b.names).flat().filter(Boolean) || [],
        });
      }
    } catch {
      continue;
    }
  }

  return {
    team: {
      id: teamData.team?.id,
      name: teamData.team?.displayName,
      abbreviation: teamData.team?.abbreviation,
      location: teamData.team?.location,
      color: teamData.team?.color,
      logos: teamData.team?.logos?.map((l: any) => l.href),
      standingSummary: teamData.team?.standingSummary,
    },
    upcomingFixtures,
  };
}

async function getTeams(league: LeagueKey): Promise<any> {
  const leagueInfo = LEAGUES[league];
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

async function getStandings(league: LeagueKey): Promise<any> {
  const leagueInfo = LEAGUES[league];
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

function listLeagues() {
  return {
    leagues: Object.entries(LEAGUES).map(([key, value]) => ({
      id: key,
      leagueCode: value.id,
      name: value.name,
    })),
  };
}

function toolResult(result: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }], isError: true as const };
}

const handler = createMcpHandler(() => {
  const server = new McpServer(
    { name: 'espn-soccer', version: '2.0.0' },
    { capabilities: { tools: {} } },
  );

  server.registerTool('get-scoreboard', {
    description: 'Get LEAGUE-WIDE scores and fixtures. Use this for general queries about what matches are happening across the league/tournament, NOT for specific team schedules. Returns live scores, upcoming matches, recent results, TV broadcast channels, and betting odds (over/under for match excitement assessment).',
    inputSchema: {
      league: leagueSchema.describe('League identifier'),
      date: z.string().describe('Optional date in YYYYMMDD format').optional(),
      limit: z.number().describe('Maximum number of matches to return (default: 10, max: 20)').optional(),
    },
  }, async ({ league, date, limit }) => {
    try {
      return toolResult(await getScoreboard(league, date, limit));
    } catch (error) {
      log('error', 'tool_error', { tool: 'get-scoreboard', error: String(error) });
      return toolError(error);
    }
  });

  server.registerTool('get-match-summary', {
    description: 'Get detailed summary of a specific match including lineups, statistics, and events.',
    inputSchema: {
      league: leagueSchema.describe('League identifier'),
      eventId: z.string().describe('Match/event ID from scoreboard'),
    },
  }, async ({ league, eventId }) => {
    try {
      return toolResult(await getMatchSummary(league, eventId));
    } catch (error) {
      log('error', 'tool_error', { tool: 'get-match-summary', error: String(error) });
      return toolError(error);
    }
  });

  server.registerTool('get-league-news', {
    description: 'Get latest news for a soccer league or tournament.',
    inputSchema: {
      league: leagueSchema.describe('League identifier'),
      limit: z.number().describe('Maximum number of news articles to return (default: 10)').optional(),
    },
  }, async ({ league, limit }) => {
    try {
      return toolResult(await getLeagueNews(league, limit));
    } catch (error) {
      log('error', 'tool_error', { tool: 'get-league-news', error: String(error) });
      return toolError(error);
    }
  });

  server.registerTool('get-team-info', {
    description: 'Get TEAM-SPECIFIC fixtures and info. Use this when the query mentions a specific team name (Arsenal, Liverpool, etc.) or asks about "next X matches" for a team. Returns next scheduled matches with dates, opponents, venues, and broadcast channels.',
    inputSchema: {
      league: leagueSchema.describe('League identifier'),
      teamId: z.string().describe('Team ID or team name (e.g., "359" or "Arsenal")'),
      limit: z.number().describe('Maximum number of upcoming fixtures to return (default: 5, max: 10)').optional(),
    },
  }, async ({ league, teamId, limit }) => {
    try {
      return toolResult(await getTeamInfo(league, teamId, limit));
    } catch (error) {
      log('error', 'tool_error', { tool: 'get-team-info', error: String(error) });
      return toolError(error);
    }
  });

  server.registerTool('get-teams', {
    description: 'Get all teams in a soccer league or tournament.',
    inputSchema: {
      league: leagueSchema.describe('League identifier'),
    },
  }, async ({ league }) => {
    try {
      return toolResult(await getTeams(league));
    } catch (error) {
      log('error', 'tool_error', { tool: 'get-teams', error: String(error) });
      return toolError(error);
    }
  });

  server.registerTool('list-leagues', {
    description: 'List all available soccer leagues and tournaments.',
    inputSchema: {},
  }, async () => {
    return toolResult(listLeagues());
  });

  server.registerTool('get-standings', {
    description: 'Get current league table/standings showing team positions. Use to identify title races, relegation battles, and European qualification spots.',
    inputSchema: {
      league: leagueSchema.describe('League identifier'),
    },
  }, async ({ league }) => {
    try {
      return toolResult(await getStandings(league));
    } catch (error) {
      log('error', 'tool_error', { tool: 'get-standings', error: String(error) });
      return toolError(error);
    }
  });

  return server;
});

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'espn-soccer' });
});

app.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'espn-soccer' });
});

const nodeHandler = toNodeHandler(handler);
app.all('/mcp', (req, res) => { void nodeHandler(req, res); });

const port = parseInt(process.env.PORT || '8080', 10);
app.listen(port, () => log('info', 'server_start', { port }));

process.on('SIGTERM', async () => {
  log('info', 'shutdown_initiated');
  await handler.close();
  process.exit(0);
});
