import type { DraftState, Match, Participant, Team } from "./types";

export const PARTICIPANTS: Participant[] = [
  { id: "mau", name: "Mau", color: "#18b764", avatar: "M" },
  { id: "adrian", name: "Adrián", color: "#1f6feb", avatar: "A" },
  { id: "ernesto", name: "Ernesto", color: "#f2b632", avatar: "E" },
];

export const TEAMS: Team[] = [
  ["south-africa", "Sudáfrica", "🇿🇦", "M73"], ["canada", "Canadá", "🇨🇦", "M73"],
  ["germany", "Alemania", "🇩🇪", "M74"], ["paraguay", "Paraguay", "🇵🇾", "M74"],
  ["netherlands", "Países Bajos", "🇳🇱", "M75"], ["morocco", "Marruecos", "🇲🇦", "M75"],
  ["brazil", "Brasil", "🇧🇷", "M76"], ["japan", "Japón", "🇯🇵", "M76"],
  ["france", "Francia", "🇫🇷", "M77"], ["sweden", "Suecia", "🇸🇪", "M77"],
  ["ivory-coast", "Costa de Marfil", "🇨🇮", "M78"], ["norway", "Noruega", "🇳🇴", "M78"],
  ["mexico", "México", "🇲🇽", "M79"], ["ecuador", "Ecuador", "🇪🇨", "M79"],
  ["england", "Inglaterra", "🏴", "M80"], ["dr-congo", "RD Congo", "🇨🇩", "M80"],
  ["usa", "Estados Unidos", "🇺🇸", "M81"], ["bosnia", "Bosnia y Herzegovina", "🇧🇦", "M81"],
  ["belgium", "Bélgica", "🇧🇪", "M82"], ["senegal", "Senegal", "🇸🇳", "M82"],
  ["portugal", "Portugal", "🇵🇹", "M83"], ["croatia", "Croacia", "🇭🇷", "M83"],
  ["spain", "España", "🇪🇸", "M84"], ["austria", "Austria", "🇦🇹", "M84"],
  ["switzerland", "Suiza", "🇨🇭", "M85"], ["algeria", "Argelia", "🇩🇿", "M85"],
  ["argentina", "Argentina", "🇦🇷", "M86"], ["cape-verde", "Cabo Verde", "🇨🇻", "M86"],
  ["colombia", "Colombia", "🇨🇴", "M87"], ["ghana", "Ghana", "🇬🇭", "M87"],
  ["australia", "Australia", "🇦🇺", "M88"], ["egypt", "Egipto", "🇪🇬", "M88"],
].map(([id, name, flag, group]) => ({
  id,
  name,
  flag,
  group,
  status: "pending",
  highestRound: 0,
}));

const bracketMatches = [
  ["M73", "16avos de final", "2026-06-28", "13:00", "Los Angeles", "SoFi Stadium", "south-africa", "canada", "M90", "A"],
  ["M74", "16avos de final", "2026-06-29", "14:30", "Boston / Foxborough", "Gillette Stadium", "germany", "paraguay", "M89", "A"],
  ["M75", "16avos de final", "2026-06-29", "19:00", "Monterrey", "Estadio BBVA", "netherlands", "morocco", "M90", "B"],
  ["M76", "16avos de final", "2026-06-29", "11:00", "Houston", "NRG Stadium", "brazil", "japan", "M91", "A"],
  ["M77", "16avos de final", "2026-06-30", "15:00", "New York / New Jersey", "MetLife Stadium", "france", "sweden", "M89", "B"],
  ["M78", "16avos de final", "2026-06-30", "11:00", "Dallas / Arlington", "AT&T Stadium", "ivory-coast", "norway", "M91", "B"],
  ["M79", "16avos de final", "2026-06-30", "19:00", "Ciudad de México", "Estadio Azteca", "mexico", "ecuador", "M92", "A"],
  ["M80", "16avos de final", "2026-07-01", "10:00", "Atlanta", "Mercedes-Benz Stadium", "england", "dr-congo", "M92", "B"],
  ["M81", "16avos de final", "2026-07-01", "18:00", "San Francisco Bay Area", "Levi's Stadium", "usa", "bosnia", "M94", "A"],
  ["M82", "16avos de final", "2026-07-01", "14:00", "Seattle", "Lumen Field", "belgium", "senegal", "M94", "B"],
  ["M83", "16avos de final", "2026-07-02", "17:00", "Toronto", "BMO Field", "portugal", "croatia", "M93", "A"],
  ["M84", "16avos de final", "2026-07-02", "13:00", "Los Angeles", "SoFi Stadium", "spain", "austria", "M93", "B"],
  ["M85", "16avos de final", "2026-07-02", "21:00", "Vancouver", "BC Place", "switzerland", "algeria", "M96", "A"],
  ["M86", "16avos de final", "2026-07-03", "16:00", "Miami", "Hard Rock Stadium", "argentina", "cape-verde", "M95", "A"],
  ["M87", "16avos de final", "2026-07-03", "19:30", "Kansas City", "Arrowhead Stadium", "colombia", "ghana", "M96", "B"],
  ["M88", "16avos de final", "2026-07-03", "12:00", "Dallas / Arlington", "AT&T Stadium", "australia", "egypt", "M95", "B"],
  ["M89", "Octavos de final", "2026-07-04", "15:00", "Philadelphia", "Lincoln Financial Field", undefined, undefined, "M97", "A"],
  ["M90", "Octavos de final", "2026-07-04", "11:00", "Houston", "NRG Stadium", undefined, undefined, "M97", "B"],
  ["M91", "Octavos de final", "2026-07-05", "14:00", "New York / New Jersey", "MetLife Stadium", undefined, undefined, "M99", "A"],
  ["M92", "Octavos de final", "2026-07-05", "18:00", "Ciudad de México", "Estadio Azteca", undefined, undefined, "M99", "B"],
  ["M93", "Octavos de final", "2026-07-06", "13:00", "Dallas / Arlington", "AT&T Stadium", undefined, undefined, "M98", "A"],
  ["M94", "Octavos de final", "2026-07-06", "19:00", "Seattle", "Lumen Field", undefined, undefined, "M98", "B"],
  ["M95", "Octavos de final", "2026-07-07", "10:00", "Atlanta", "Mercedes-Benz Stadium", undefined, undefined, "M100", "A"],
  ["M96", "Octavos de final", "2026-07-07", "14:00", "Vancouver", "BC Place", undefined, undefined, "M100", "B"],
  ["M97", "Cuartos de final", "2026-07-09", "14:00", "Boston / Foxborough", "Gillette Stadium", undefined, undefined, "M101", "A"],
  ["M98", "Cuartos de final", "2026-07-10", "13:00", "Los Angeles", "SoFi Stadium", undefined, undefined, "M101", "B"],
  ["M99", "Cuartos de final", "2026-07-11", "15:00", "Miami", "Hard Rock Stadium", undefined, undefined, "M102", "A"],
  ["M100", "Cuartos de final", "2026-07-11", "19:00", "Kansas City", "Arrowhead Stadium", undefined, undefined, "M102", "B"],
  ["M101", "Semifinal", "2026-07-14", "13:00", "Dallas / Arlington", "AT&T Stadium", undefined, undefined, "M104", "A", "M103", "A"],
  ["M102", "Semifinal", "2026-07-15", "13:00", "Atlanta", "Mercedes-Benz Stadium", undefined, undefined, "M104", "B", "M103", "B"],
  ["M103", "Tercer lugar", "2026-07-18", "15:00", "Miami", "Hard Rock Stadium", undefined, undefined, undefined, undefined],
  ["M104", "Final", "2026-07-19", "13:00", "New York / New Jersey", "MetLife Stadium", undefined, undefined, undefined, undefined],
] as const;

function buildMatchDate(date: string, time: string) {
  return `${date}T${time}:00-06:00`;
}

export function createInitialMatches(): Match[] {
  return bracketMatches.map(([id, round, date, time, city, venue, teamAId, teamBId, nextMatchId, nextSlot, loserNextMatchId, loserNextSlot]) => ({
      id,
      round,
      date: buildMatchDate(date, time),
      time,
      timezone: "America/Mexico_City",
      venue,
      city,
      teamAId,
      teamBId,
      status: "scheduled",
      nextMatchId,
      nextSlot,
      loserNextMatchId,
      loserNextSlot,
    }));
}

export function createInitialState(): DraftState {
  return {
    participants: PARTICIPANTS,
    teams: TEAMS,
    picks: [],
    matches: createInitialMatches(),
    started: false,
    paused: true,
    completed: false,
    secondsLeft: 10,
    draftDuration: 10,
    turnStartedAt: undefined,
    clockOwnerId: undefined,
  };
}
