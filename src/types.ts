export type ParticipantId = "mau" | "adrian" | "ernesto";
export type TeamStatus = "pending" | "alive" | "eliminated" | "champion";
export type PickType = "manual" | "automatic";
export type MatchStatus = "scheduled" | "live" | "finished";
export type RoundName =
  | "16avos de final"
  | "Octavos de final"
  | "Cuartos de final"
  | "Semifinal"
  | "Tercer lugar"
  | "Final";

export interface Participant {
  id: ParticipantId;
  name: string;
  color: string;
  avatar: string;
}

export interface Team {
  id: string;
  name: string;
  flag: string;
  group: string;
  ownerId?: ParticipantId;
  status: TeamStatus;
  highestRound: number;
}

export interface DraftPick {
  pickNumber: number;
  round: number;
  participantId: ParticipantId;
  teamId: string;
  pickType: PickType;
  timestamp: string;
}

export interface Match {
  id: string;
  round: RoundName;
  date: string;
  time?: string;
  timezone?: string;
  venue?: string;
  city?: string;
  teamAId?: string;
  teamBId?: string;
  scoreA?: number;
  scoreB?: number;
  status: MatchStatus;
  winnerTeamId?: string;
  nextMatchId?: string;
  nextSlot?: "A" | "B";
  loserNextMatchId?: string;
  loserNextSlot?: "A" | "B";
}

export interface DraftState {
  participants: Participant[];
  teams: Team[];
  picks: DraftPick[];
  matches: Match[];
  started: boolean;
  paused: boolean;
  completed: boolean;
  secondsLeft: number;
  draftDuration: 10 | 30 | 60;
  turnStartedAt?: string;
  clockOwnerId?: string;
}
