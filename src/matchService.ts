import type { DraftState, Match, MatchStatus, Team } from "./types";

const roundLevel: Record<string, number> = {
  "16avos de final": 1,
  "Octavos de final": 2,
  "Cuartos de final": 3,
  Semifinal: 4,
  "Tercer lugar": 4,
  Final: 5,
};

export function updateMatch(
  state: DraftState,
  matchId: string,
  patch: Partial<Pick<Match, "scoreA" | "scoreB" | "status" | "winnerTeamId">>,
): DraftState {
  const matches = state.matches.map((match) => {
    if (match.id !== matchId) return match;
    return inferWinnerFromScore({ ...match, ...patch });
  });
  return applyAdvancement({ ...state, matches });
}

export function simulateMatch(state: DraftState, matchId: string): DraftState {
  const match = state.matches.find((item) => item.id === matchId);
  if (!match || !match.teamAId || !match.teamBId) return state;
  let scoreA = Math.floor(Math.random() * 5);
  let scoreB = Math.floor(Math.random() * 5);
  if (scoreA === scoreB) scoreA += 1;
  const winnerTeamId = scoreA > scoreB ? match.teamAId : match.teamBId;
  return updateMatch(state, matchId, { scoreA, scoreB, winnerTeamId, status: "finished" });
}

export function changeMatchStatus(state: DraftState, matchId: string, status: MatchStatus): DraftState {
  return updateMatch(state, matchId, { status });
}

export function recalculateAdvancement(state: DraftState): DraftState {
  return applyAdvancement({
    ...state,
    matches: state.matches.map((match) => inferWinnerFromScore(match)),
  });
}

function inferWinnerFromScore(match: Match): Match {
  if (
    match.status === "finished" &&
    !match.winnerTeamId &&
    match.teamAId &&
    match.teamBId &&
    typeof match.scoreA === "number" &&
    typeof match.scoreB === "number" &&
    match.scoreA !== match.scoreB
  ) {
    return {
      ...match,
      winnerTeamId: match.scoreA > match.scoreB ? match.teamAId : match.teamBId,
    };
  }
  return match;
}

function applyAdvancement(state: DraftState): DraftState {
  let matches = state.matches.map((match) => ({ ...match }));
  let teams = state.teams.map((team) => ({
    ...team,
    status: team.ownerId ? "alive" : "pending",
    highestRound: 0,
  }) as Team);

  const finishedMatches = matches.filter((match) => match.status === "finished" && match.winnerTeamId);
  const loserIds = new Set<string>();

  finishedMatches.forEach((match) => {
    const loser = match.teamAId === match.winnerTeamId ? match.teamBId : match.teamAId;
    if (loser) loserIds.add(loser);
    const level = roundLevel[match.round] ?? 0;
    teams = teams.map((team) =>
      team.id === match.winnerTeamId
        ? { ...team, highestRound: Math.max(team.highestRound, level) }
        : team,
    );
    if (!match.nextMatchId && match.round === "Final") {
      teams = teams.map((team) =>
        team.id === match.winnerTeamId ? { ...team, status: "champion", highestRound: 6 } : team,
      );
    }
    if (match.nextMatchId && match.nextSlot) {
      matches = matches.map((next) => {
        if (next.id !== match.nextMatchId) return next;
        return match.nextSlot === "A" ? { ...next, teamAId: match.winnerTeamId } : { ...next, teamBId: match.winnerTeamId };
      });
    }
    if (loser && match.loserNextMatchId && match.loserNextSlot) {
      matches = matches.map((next) => {
        if (next.id !== match.loserNextMatchId) return next;
        return match.loserNextSlot === "A" ? { ...next, teamAId: loser } : { ...next, teamBId: loser };
      });
    }
  });

  const teamsWithUpcomingMatch = new Set<string>();
  matches
    .filter((match) => match.status !== "finished")
    .forEach((match) => {
      if (match.teamAId) teamsWithUpcomingMatch.add(match.teamAId);
      if (match.teamBId) teamsWithUpcomingMatch.add(match.teamBId);
    });

  teams = teams.map((team) => {
    if (team.status === "champion") return team;
    if (loserIds.has(team.id) && !teamsWithUpcomingMatch.has(team.id)) return { ...team, status: "eliminated" };
    if (team.ownerId) return { ...team, status: "alive" };
    return team;
  });

  return { ...state, matches, teams };
}
