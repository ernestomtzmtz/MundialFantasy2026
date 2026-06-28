import { createInitialMatches, createInitialState, PARTICIPANTS, TEAMS } from "./data";
import { recalculateAdvancement } from "./matchService";
import type { DraftPick, DraftState } from "./types";

const STORAGE_KEY = "world-cup-fantasy-draft:v1";

export function loadState(): DraftState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return createInitialState();
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return createInitialState();
  }
}

export function saveState(state: DraftState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function normalizeState(value: unknown): DraftState {
  const initial = createInitialState();
  if (!value || typeof value !== "object") return initial;

  const candidate = value as Partial<DraftState>;
  const draftDuration = candidate.draftDuration === 30 || candidate.draftDuration === 60 ? candidate.draftDuration : 10;
  const savedTeams = Array.isArray(candidate.teams) ? candidate.teams : [];
  const savedMatches = Array.isArray(candidate.matches) ? candidate.matches : [];
  const savedParticipants = Array.isArray(candidate.participants) ? candidate.participants : [];

  const teams = TEAMS.map((team) => {
    const saved = savedTeams.find((item) => Boolean(item && item.id === team.id));
    return {
      ...team,
      ownerId: saved?.ownerId,
      status: saved?.status ?? team.status,
      highestRound: saved?.highestRound ?? team.highestRound,
    };
  });

  const matches = createInitialMatches().map((match) => {
    const saved = savedMatches.find((item) => Boolean(item && item.id === match.id));
    if (!saved) return match;
    return {
      ...match,
      scoreA: saved.scoreA,
      scoreB: saved.scoreB,
      status: saved.status ?? match.status,
      winnerTeamId: saved.winnerTeamId,
      date: match.date,
      time: match.time,
      timezone: match.timezone,
      venue: match.venue,
      city: match.city,
      nextMatchId: match.nextMatchId,
      nextSlot: match.nextSlot,
      loserNextMatchId: match.loserNextMatchId,
      loserNextSlot: match.loserNextSlot,
      teamAId: match.round === "16avos de final" ? match.teamAId : (saved.teamAId ?? match.teamAId),
      teamBId: match.round === "16avos de final" ? match.teamBId : (saved.teamBId ?? match.teamBId),
    };
  });

  const participants = PARTICIPANTS.map((participant) => {
    const saved = savedParticipants.find((item) => Boolean(item && item.id === participant.id));
    return { ...participant, ...saved };
  });

  return recalculateAdvancement({
    ...initial,
    ...candidate,
    participants,
    teams,
    matches,
    picks: Array.isArray(candidate.picks) ? (candidate.picks.filter(Boolean) as DraftPick[]) : [],
    started: Boolean(candidate.started),
    paused: typeof candidate.paused === "boolean" ? candidate.paused : true,
    completed: Boolean(candidate.completed),
    secondsLeft: typeof candidate.secondsLeft === "number" ? Math.min(draftDuration, Math.max(0, candidate.secondsLeft)) : draftDuration,
    draftDuration,
    turnStartedAt: typeof candidate.turnStartedAt === "string" ? candidate.turnStartedAt : undefined,
    clockOwnerId: typeof candidate.clockOwnerId === "string" ? candidate.clockOwnerId : undefined,
  });
}

export function exportState(state: DraftState) {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "world-cup-fantasy-draft.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return json;
}
