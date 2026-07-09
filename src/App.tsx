import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Download,
  Medal,
  Pause,
  Play,
  RefreshCcw,
  Shuffle,
  TrendingUp,
  Trophy,
  Upload,
} from "lucide-react";
import { createInitialState, PARTICIPANTS } from "./data";
import { ensureRemoteDraftState, saveRemoteDraftState, subscribeToRemoteDraftState } from "./firebaseService";
import { changeMatchStatus, simulateMatch, updateMatch } from "./matchService";
import { exportState, loadState, normalizeState, saveState } from "./storage";
import type { DraftPick, DraftState, Match, MatchStatus, ParticipantId, RoundName, Team } from "./types";

const DRAFT_ORDER: ParticipantId[] = ["mau", "adrian", "ernesto"];
const ROUND_NAMES: RoundName[] = [
  "16avos de final",
  "Octavos de final",
  "Cuartos de final",
  "Semifinal",
  "Tercer lugar",
  "Final",
];
const statusLabels = {
  pending: "Pendiente",
  alive: "Vivo",
  eliminated: "Eliminado",
  champion: "Campeón",
};
const matchStatusLabels: Record<MatchStatus, string> = {
  scheduled: "Programado",
  live: "En vivo",
  finished: "Finalizado",
};
const CLIENT_ID_KEY = "world-cup-fantasy-draft:client-id";
const TWENTY_SECONDS_ALERT = "Twenty seconds left";
const TEAM_STRENGTH: Record<string, number> = {
  argentina: 2110,
  france: 2105,
  spain: 2055,
  brazil: 2025,
  england: 2000,
  germany: 1985,
  portugal: 1950,
  netherlands: 1925,
  belgium: 1915,
  colombia: 1890,
  switzerland: 1870,
  usa: 1840,
  morocco: 1835,
  mexico: 1825,
  japan: 1820,
  croatia: 1815,
  norway: 1810,
  senegal: 1790,
  austria: 1785,
  australia: 1730,
  "ivory-coast": 1725,
  paraguay: 1715,
  canada: 1705,
  ecuador: 1700,
  sweden: 1695,
  ghana: 1680,
  algeria: 1670,
  egypt: 1665,
  "south-africa": 1625,
  "dr-congo": 1605,
  bosnia: 1595,
  "cape-verde": 1585,
};
const HOST_BONUS: Record<string, number> = {
  usa: 22,
  mexico: 22,
  canada: 22,
};
const HEAD_TO_HEAD_BONUS: Record<string, number> = {
  "france|morocco": 32,
  "spain|belgium": 18,
  "england|norway": 20,
  "argentina|switzerland": 26,
  "morocco|canada": 38,
  "france|paraguay": 34,
  "norway|brazil": -28,
  "belgium|usa": 16,
  "spain|portugal": 8,
  "switzerland|colombia": -6,
};

type View = "draft" | "teams" | "bracket" | "scores" | "ranking" | "probabilities";

export default function App() {
  const [state, setState] = useState<DraftState>(() => loadState());
  const [view, setView] = useState<View>("draft");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [syncStatus, setSyncStatus] = useState("Conectando...");
  const [clockNow, setClockNow] = useState(Date.now());
  const [clockAlert, setClockAlert] = useState("");
  const clientId = useRef(getClientId());
  const applyingRemoteState = useRef(false);
  const remoteReady = useRef(false);
  const lastRemoteJson = useRef("");
  const saveTimeout = useRef<number | undefined>(undefined);
  const lastTwentySecondTurn = useRef("");
  const lastCountdownSecond = useRef<number | undefined>(undefined);
  const lastPickSoundCount = useRef(state.picks.length);
  const lastAlertTurn = useRef("");
  const previousCompleted = useRef(isDraftComplete(state));
  const previousStarted = useRef(state.started);

  const currentPickNumber = state.picks.length + 1;
  const currentRound = Math.floor(state.picks.length / DRAFT_ORDER.length) + 1;
  const currentParticipantId = getParticipantForPick(state.picks.length);
  const currentParticipant = participantById(state, currentParticipantId);
  const currentTeam = selectedTeamId ? state.teams.find((team) => team.id === selectedTeamId && !team.ownerId) : undefined;
  const visibleSecondsLeft = getVisibleSecondsLeft(state, clockNow);
  const draftComplete = isDraftComplete(state);

  useEffect(() => {
    let unsubscribe: undefined | (() => void);
    let active = true;

    ensureRemoteDraftState(state)
      .then((remoteState) => {
        if (!active) return;
        applyingRemoteState.current = true;
        lastRemoteJson.current = JSON.stringify(remoteState);
        setState(remoteState);
        remoteReady.current = true;
        setSyncStatus("Sincronizado");
        unsubscribe = subscribeToRemoteDraftState(
          (remoteStateUpdate) => {
            const nextJson = JSON.stringify(remoteStateUpdate);
            if (nextJson === lastRemoteJson.current) return;
            applyingRemoteState.current = true;
            lastRemoteJson.current = nextJson;
            setState(remoteStateUpdate);
            setSyncStatus("Sincronizado");
          },
          (error) => {
            console.error(error);
            setSyncStatus("Error de sincronización");
          },
        );
      })
      .catch((error) => {
        console.error(error);
        remoteReady.current = false;
        setSyncStatus("Firebase no conectado");
      });

    return () => {
      active = false;
      unsubscribe?.();
      if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    };
  }, []);

  useEffect(() => {
    saveState(state);

    if (applyingRemoteState.current) {
      applyingRemoteState.current = false;
      return;
    }
    if (!remoteReady.current) return;

    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    setSyncStatus("Guardando...");
    saveTimeout.current = window.setTimeout(() => {
      saveRemoteDraftState(state)
        .then(() => {
          lastRemoteJson.current = JSON.stringify(state);
          setSyncStatus("Sincronizado");
        })
        .catch((error) => {
          console.error(error);
          setSyncStatus("Error al guardar");
        });
    }, 250);
  }, [state]);

  useEffect(() => {
    function unlockAudio() {
      primeAudio();
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    }

    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);

    return () => {
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (state.started && !previousStarted.current && !draftComplete) {
      speakText("Comenzamos");
      playDraftStartSound();
    }
    previousStarted.current = state.started;
  }, [draftComplete, state.started]);

  useEffect(() => {
    if (!state.started || state.paused || state.completed) return;
    const interval = window.setInterval(() => {
      setClockNow(Date.now());
    }, 250);
    return () => window.clearInterval(interval);
  }, [state.started, state.paused, state.completed, state.turnStartedAt]);

  useEffect(() => {
    if (!state.started || state.paused || state.completed) return;
    if (visibleSecondsLeft > 0) return;
    if (!selectedTeamId && state.clockOwnerId !== clientId.current && !isPastAutomaticGrace(state, clockNow)) return;
    makePick(selectedTeamId || undefined, selectedTeamId ? "manual" : "automatic", true);
  }, [clockNow, selectedTeamId, state, visibleSecondsLeft]);

  useEffect(() => {
    const turnKey = `${state.picks.length}:${state.turnStartedAt ?? "paused"}`;
    if (!state.started || state.paused || state.completed || !state.turnStartedAt) {
      setClockAlert("");
      lastCountdownSecond.current = undefined;
      lastAlertTurn.current = turnKey;
      return;
    }

    if (lastAlertTurn.current !== turnKey) {
      lastAlertTurn.current = turnKey;
      lastCountdownSecond.current = undefined;
      setClockAlert("");
      return;
    }

    if (visibleSecondsLeft === 20 && lastTwentySecondTurn.current !== turnKey) {
      lastTwentySecondTurn.current = turnKey;
      setClockAlert(TWENTY_SECONDS_ALERT);
      speakText(TWENTY_SECONDS_ALERT);
      playTwentySecondSound();
    } else if (visibleSecondsLeft < 20 && visibleSecondsLeft > 10 && clockAlert) {
      setClockAlert("");
    }

    if (visibleSecondsLeft <= 10 && visibleSecondsLeft > 0 && lastCountdownSecond.current !== visibleSecondsLeft) {
      lastCountdownSecond.current = visibleSecondsLeft;
      setClockAlert(`Cuenta regresiva: ${visibleSecondsLeft}`);
      playCountdownSound(visibleSecondsLeft);
    }

    if (visibleSecondsLeft > 10) {
      lastCountdownSecond.current = undefined;
    }
  }, [clockAlert, state.started, state.paused, state.completed, state.picks.length, state.turnStartedAt, visibleSecondsLeft]);

  useEffect(() => {
    if (state.picks.length <= lastPickSoundCount.current) {
      lastPickSoundCount.current = state.picks.length;
      return;
    }

    const latestPick = state.picks[state.picks.length - 1];
    if (latestPick?.pickType === "automatic") {
      playRandomPickSound();
    } else {
      playPickConfirmedSound();
    }
    lastPickSoundCount.current = state.picks.length;
  }, [state.picks]);

  useEffect(() => {
    if (draftComplete && !state.completed) {
      setState((draft) => ({ ...draft, completed: true, paused: true, turnStartedAt: undefined, clockOwnerId: undefined }));
    }

    if (draftComplete && !previousCompleted.current) {
      speakText("Felicidades, el draft ha terminado.");
      playDraftCompleteSound();
    }
    previousCompleted.current = draftComplete;
  }, [draftComplete, state.completed]);

  function makePick(teamId?: string, pickType: "manual" | "automatic" = "manual", deterministicAutomatic = false) {
    primeAudio();
    setState((draft) => {
      if (!draft.started || draft.completed) return draft;
      const openTeams = draft.teams.filter((team) => !team.ownerId);
      if (openTeams.length === 0) return { ...draft, completed: true, paused: true };
      const requested = teamId ? openTeams.find((team) => team.id === teamId) : undefined;
      const team =
        requested ??
        (deterministicAutomatic
          ? getDeterministicAutomaticTeam(openTeams, draft)
          : openTeams[Math.floor(Math.random() * openTeams.length)]);
      const participantId = getParticipantForPick(draft.picks.length);
      const pick: DraftPick = {
        pickNumber: draft.picks.length + 1,
        round: Math.floor(draft.picks.length / DRAFT_ORDER.length) + 1,
        participantId,
        teamId: team.id,
        pickType: requested ? pickType : "automatic",
        timestamp: new Date().toISOString(),
      };
      const teams = draft.teams.map((item) =>
        item.id === team.id ? { ...item, ownerId: participantId, status: "alive" as const } : item,
      );
      const completed = draft.picks.length + 1 >= draft.teams.length;
      return {
        ...draft,
        teams,
        picks: [...draft.picks, pick],
        completed,
        paused: completed,
        secondsLeft: draft.draftDuration,
        turnStartedAt: completed ? undefined : new Date().toISOString(),
        clockOwnerId: completed ? undefined : clientId.current,
      };
    });
    setSelectedTeamId("");
  }

  function startDraft() {
    primeAudio();
    setState((draft) => ({
      ...draft,
      started: true,
      paused: false,
      completed: draft.picks.length >= draft.teams.length,
      secondsLeft: draft.secondsLeft > 0 ? draft.secondsLeft : draft.draftDuration,
      turnStartedAt: new Date(Date.now() - (draft.draftDuration - (draft.secondsLeft > 0 ? draft.secondsLeft : draft.draftDuration)) * 1000).toISOString(),
      clockOwnerId: clientId.current,
    }));
  }

  function togglePauseDraft() {
    primeAudio();
    setState((draft) => {
      if (!draft.started || draft.completed) return draft;
      if (draft.paused) {
        const remaining = draft.secondsLeft > 0 ? draft.secondsLeft : draft.draftDuration;
        return {
          ...draft,
          paused: false,
          secondsLeft: remaining,
          turnStartedAt: new Date(Date.now() - (draft.draftDuration - remaining) * 1000).toISOString(),
          clockOwnerId: clientId.current,
        };
      }

      return {
        ...draft,
        paused: true,
        secondsLeft: getVisibleSecondsLeft(draft),
        turnStartedAt: undefined,
        clockOwnerId: undefined,
      };
    });
  }

  function resetDraft() {
    setSelectedTeamId("");
    setState(createInitialState());
  }

  function importJson(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setState(normalizeState(JSON.parse(String(reader.result))));
      } catch {
        alert("El JSON no tiene un formato válido.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="min-h-screen text-white">
      <header className="field-line border-b border-white/10 bg-ink/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-turf">Mundial 2026</p>
            <h1 className="mt-1 text-3xl font-black text-white md:text-5xl">World Cup Fantasy Draft</h1>
            <p className="mt-2 text-sm font-bold text-white/65">Firebase: {syncStatus}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:flex">
            {state.participants.map((participant) => (
              <ParticipantBadge key={participant.id} participantId={participant.id} state={state} compact />
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5">
        <nav className="mb-5 flex gap-2 overflow-x-auto rounded-lg border border-white/10 bg-white/8 p-1">
          {[
            ["draft", "Draft"],
            ["teams", "Mis Equipos"],
            ["bracket", "Llaves"],
            ["scores", "Marcadores"],
            ["ranking", "Ranking"],
            ["probabilities", "Probabilidades"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id as View)}
              className={`min-w-max rounded-md px-4 py-2 text-sm font-bold transition ${
                view === id ? "bg-trophy text-ink" : "text-white/75 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {view === "draft" && (
          <DraftView
            state={state}
            currentParticipantId={currentParticipantId}
            currentParticipantName={currentParticipant.name}
            currentPickNumber={currentPickNumber}
            currentRound={currentRound}
            selectedTeamId={selectedTeamId}
            setSelectedTeamId={setSelectedTeamId}
            currentTeam={currentTeam}
            makePick={makePick}
            startDraft={startDraft}
            togglePauseDraft={togglePauseDraft}
            resetDraft={resetDraft}
            setState={setState}
            importJson={importJson}
            visibleSecondsLeft={visibleSecondsLeft}
            clockAlert={clockAlert}
            draftComplete={draftComplete}
          />
        )}
        {view === "teams" && <TeamsView state={state} />}
        {view === "bracket" && <BracketView state={state} setState={setState} />}
        {view === "scores" && <ScoresView state={state} setState={setState} />}
        {view === "ranking" && <RankingView state={state} />}
        {view === "probabilities" && <ProbabilitiesView state={state} />}
      </main>
    </div>
  );
}

function DraftView(props: {
  state: DraftState;
  currentParticipantId: ParticipantId;
  currentParticipantName: string;
  currentPickNumber: number;
  currentRound: number;
  selectedTeamId: string;
  setSelectedTeamId: (id: string) => void;
  currentTeam?: Team;
  makePick: (teamId?: string, pickType?: "manual" | "automatic") => void;
  startDraft: () => void;
  togglePauseDraft: () => void;
  resetDraft: () => void;
  setState: React.Dispatch<React.SetStateAction<DraftState>>;
  importJson: (file?: File) => void;
  visibleSecondsLeft: number;
  clockAlert: string;
  draftComplete: boolean;
}) {
  const [resetConfirmStep, setResetConfirmStep] = useState(0);
  const {
    state,
    currentParticipantId,
    currentParticipantName,
    currentPickNumber,
    currentRound,
    selectedTeamId,
    setSelectedTeamId,
    currentTeam,
    makePick,
    startDraft,
    togglePauseDraft,
    resetDraft,
    setState,
    importJson,
    visibleSecondsLeft,
    clockAlert,
    draftComplete,
  } = props;
  const draftControlsLocked = draftComplete;
  const canStartDraft = !state.started && !draftComplete;
  const canTogglePause = state.started && !draftComplete;
  const resetButtonLabel =
    resetConfirmStep === 0 ? "Reiniciar draft" : resetConfirmStep === 1 ? "Confirmar reinicio" : "Confirmar otra vez";

  function handleResetClick() {
    if (resetConfirmStep < 2) {
      setResetConfirmStep((step) => step + 1);
      return;
    }
    setResetConfirmStep(0);
    resetDraft();
  }

  function cancelReset() {
    setResetConfirmStep(0);
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-lg border border-white/10 bg-white/95 p-4 text-ink shadow-glow md:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_180px]">
          <div>
            <p className="text-sm font-bold uppercase text-ocean">
              {draftComplete ? `${state.picks.length} picks completados` : `Pick #${Math.min(currentPickNumber, state.teams.length)}`}
            </p>
            <h2 className="mt-1 text-3xl font-black">{draftComplete ? "Draft terminado" : `Turno de ${currentParticipantName}`}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {draftComplete
                ? "Felicidades, todos los equipos ya tienen dueño."
                : `Ronda ${currentRound} · Orden snake: Mau → Adrián → Ernesto → Ernesto → Adrián → Mau`}
            </p>
          </div>
          <div className="rounded-lg bg-ink p-4 text-center text-white">
            <p className="text-xs font-bold uppercase text-white/50">Reloj</p>
            <p className={`text-5xl font-black ${visibleSecondsLeft <= 3 ? "text-coral" : "text-trophy"}`}>
              {visibleSecondsLeft}
            </p>
            <p className={`mt-2 min-h-5 text-xs font-black uppercase ${visibleSecondsLeft <= 10 ? "text-coral" : "text-trophy"}`}>
              {clockAlert}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-black uppercase text-slate-500">Tiempo por pick</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {([30, 60, 120] as const).map((duration) => (
              <button
                key={duration}
                onClick={() => setState((draft) => ({ ...draft, draftDuration: duration, secondsLeft: duration }))}
                disabled={state.started || state.picks.length > 0}
                className={`rounded-md px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  state.draftDuration === duration ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-slate-200 hover:ring-turf"
                }`}
              >
                {duration} seg
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={startDraft}
            disabled={!canStartDraft}
            className="inline-flex items-center gap-2 rounded-md bg-turf px-4 py-2 font-black text-ink disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Play size={18} /> Iniciar draft
          </button>
          <button
            onClick={togglePauseDraft}
            disabled={!canTogglePause}
            className="inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-2 font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Pause size={18} /> {state.paused ? "Reanudar draft" : "Pausar draft"}
          </button>
          <button
            onClick={handleResetClick}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 font-black text-white ${
              resetConfirmStep > 0 ? "bg-coral" : "bg-slate-900"
            }`}
          >
            <RefreshCcw size={18} /> {resetButtonLabel}
          </button>
          {resetConfirmStep > 0 && (
            <button onClick={cancelReset} className="rounded-md bg-slate-200 px-4 py-2 font-black text-ink">
              Cancelar
            </button>
          )}
          <button
            onClick={() => makePick(undefined, "automatic")}
            disabled={!state.started || state.paused || draftControlsLocked}
            className="inline-flex items-center gap-2 rounded-md bg-coral px-4 py-2 font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Shuffle size={18} /> Pick aleatorio
          </button>
        </div>
        {resetConfirmStep > 0 && (
          <p className="mt-2 text-sm font-bold text-coral">
            Esta acción borra picks, dueños, marcadores y ranking. Confirma {3 - resetConfirmStep} vez más para reiniciar todo.
          </p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {state.teams.map((team) => {
            const owner = team.ownerId ? participantById(state, team.ownerId) : undefined;
            const isSelected = selectedTeamId === team.id;
            const isOwned = Boolean(owner);
            return (
            <button
              key={team.id}
              onClick={() => !isOwned && setSelectedTeamId(team.id)}
              onDoubleClick={() => !isOwned && makePick(team.id, "manual")}
              disabled={isOwned}
              className={`rounded-lg border p-3 text-left transition hover:-translate-y-0.5 ${
                isOwned
                  ? "cursor-not-allowed border-slate-700 bg-slate-950 text-white opacity-85"
                  : isSelected
                    ? "border-trophy bg-yellow-50 ring-2 ring-trophy"
                    : "border-slate-200 bg-white hover:border-turf"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-3xl">{team.flag}</span>
                {isOwned ? (
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-black uppercase text-white">Tomado</span>
                ) : isSelected ? (
                  <span className="rounded-full bg-trophy px-2 py-1 text-[10px] font-black uppercase text-ink">Seleccionado</span>
                ) : null}
              </div>
              <span className="mt-2 block font-black">{team.name}</span>
              <span className={`text-xs font-bold uppercase ${isOwned ? "text-white/45" : "text-slate-500"}`}>{team.group}</span>
              <span className={`mt-2 block min-h-8 text-xs font-bold ${isOwned ? "text-white/70" : "text-slate-500"}`}>
                {owner ? `Dueño: ${owner.name}` : isSelected ? "Doble click confirma pick manual" : "Click para preparar pick"}
              </span>
            </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={() => currentTeam && makePick(currentTeam.id, "manual")}
            disabled={!currentTeam || !state.started || state.paused || draftComplete}
            className="rounded-md bg-trophy px-5 py-3 font-black text-ink disabled:opacity-45"
          >
            Confirmar pick manual
          </button>
          <span className="text-sm font-semibold text-slate-600">
            {currentTeam
              ? `${currentTeam.flag} ${currentTeam.name} queda preparado; si llega a 0 se toma como manual.`
              : "Elige un equipo disponible"}
          </span>
        </div>
      </div>

      <aside className="space-y-5">
        <ImportExportPanel state={state} importJson={importJson} />
        <div className="rounded-lg border border-white/10 bg-white/10 p-4">
          <h3 className="mb-3 text-lg font-black">Orden del Draft</h3>
          <div className="space-y-2">
            {state.participants.map((participant) => (
              <ParticipantBadge key={participant.id} participantId={participant.id} state={state} active={participant.id === currentParticipantId} />
            ))}
          </div>
        </div>
        <PickHistory state={state} />
      </aside>
    </section>
  );
}

function TeamsView({ state }: { state: DraftState }) {
  return (
    <section className="grid gap-5 lg:grid-cols-3">
      {state.participants.map((participant) => {
        const teams = state.teams.filter((team) => team.ownerId === participant.id);
        return (
          <div key={participant.id} className="rounded-lg border border-white/10 bg-white/95 p-4 text-ink">
            <ParticipantBadge participantId={participant.id} state={state} forceLight />
            <p className="mt-2 text-sm font-bold text-slate-500">{teams.length} equipos</p>
            <div className="mt-4 space-y-2">
              {teams.map((team) => (
                <TeamRow key={team.id} team={team} state={state} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function BracketView({ state, setState }: { state: DraftState; setState: React.Dispatch<React.SetStateAction<DraftState>> }) {
  return (
    <section className="overflow-x-auto pb-3">
      <div className="flex min-w-[1180px] gap-4">
        {ROUND_NAMES.map((round) => (
          <div key={round} className="w-72 shrink-0">
            <h2 className="mb-3 text-xl font-black">{round}</h2>
            <div className="space-y-3">
              {state.matches
                .filter((match) => match.round === round)
                .map((match) => (
                  <MatchCard key={match.id} match={match} state={state} setState={setState} compact />
                ))}
            </div>
          </div>
        ))}
        <div className="w-72 shrink-0">
          <h2 className="mb-3 text-xl font-black">Campeón</h2>
          <div className="rounded-lg border border-trophy/50 bg-trophy p-5 text-ink">
            <Trophy size={34} />
            <p className="mt-3 text-2xl font-black">{state.teams.find((team) => team.status === "champion")?.name ?? "Por definir"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScoresView({ state, setState }: { state: DraftState; setState: React.Dispatch<React.SetStateAction<DraftState>> }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {state.matches.map((match) => (
        <MatchCard key={match.id} match={match} state={state} setState={setState} />
      ))}
    </section>
  );
}

function RankingView({ state }: { state: DraftState }) {
  const rows = useMemo(
    () =>
      state.participants
        .map((participant) => {
          const teams = state.teams.filter((team) => team.ownerId === participant.id);
          const points = teams.reduce((sum, team) => sum + pointsForTeam(team), 0);
          const money = moneyForParticipant(state, participant.id);
          return {
            participant,
            teams,
            points,
            ...money,
            alive: teams.filter((team) => team.status === "alive" || team.status === "champion").length,
            eliminated: teams.filter((team) => team.status === "eliminated").length,
            octavos: teams.filter((team) => team.highestRound >= 1).length,
            quarters: teams.filter((team) => team.highestRound >= 2).length,
            semis: teams.filter((team) => team.highestRound >= 3).length,
            finals: teams.filter((team) => team.highestRound >= 4).length,
            champion: teams.filter((team) => team.status === "champion").length,
          };
        })
        .sort((a, b) => b.points - a.points),
    [state],
  );
  const potTotal = useMemo(() => moneyPotTotal(state), [state]);

  return (
    <section className="rounded-lg border border-white/10 bg-white/95 p-4 text-ink">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-separate border-spacing-y-2">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr>
              <th>Participante</th>
              <th>Puntos</th>
              <th>Ganado</th>
              <th>Debe pagar</th>
              <th>Neto</th>
              <th>Vivos</th>
              <th>Eliminados</th>
              <th>Octavos</th>
              <th>Cuartos</th>
              <th>Semis</th>
              <th>Final</th>
              <th>Campeón</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.participant.id} className="bg-slate-100">
                <td className="rounded-l-md p-3 font-black">
                  <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm text-white">{index + 1}</span>
                  {row.participant.name}
                </td>
                <td className="p-3 font-black text-ocean">{row.points}</td>
                <td className="p-3 font-black text-green-700">${row.moneyWon}</td>
                <td className="p-3 font-black text-red-700">${row.moneyOwed}</td>
                <td className={`p-3 font-black ${row.moneyNet >= 0 ? "text-green-700" : "text-red-700"}`}>${row.moneyNet}</td>
                <td className="p-3">{row.alive}</td>
                <td className="p-3">{row.eliminated}</td>
                <td className="p-3">{row.octavos}</td>
                <td className="p-3">{row.quarters}</td>
                <td className="p-3">{row.semis}</td>
                <td className="p-3">{row.finals}</td>
                <td className="rounded-r-md p-3">{row.champion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 rounded-lg border border-trophy/40 bg-yellow-50 p-4">
        <p className="text-xs font-black uppercase text-slate-500">Acumulado</p>
        <p className="mt-1 text-3xl font-black text-ink">${potTotal}</p>
        <p className="mt-1 text-sm font-bold text-slate-600">
          Se suman $50 por cada partido finalizado con dueños diferentes.
        </p>
      </div>
    </section>
  );
}

function ProbabilitiesView({ state }: { state: DraftState }) {
  const model = useMemo(() => calculateChampionProbabilities(state), [state]);
  const leader = model.participantRows[0];

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-white/95 p-4 text-ink md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase text-ocean">Probabilidad de victoria</p>
            <h2 className="mt-1 text-3xl font-black">Quién tiene más opciones de campeón</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 font-black text-white">
            <TrendingUp size={18} /> {leader ? `${leader.participant.name}: ${formatPercent(leader.probability)}` : "Sin datos"}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {model.participantRows.map((row) => (
            <div key={row.participant.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black text-ink"
                    style={{ background: row.participant.color }}
                  >
                    {row.participant.avatar}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-black">{row.participant.name}</p>
                    <p className="text-xs font-bold text-slate-500">{row.liveTeams} equipos con ruta posible</p>
                  </div>
                </div>
                <strong className="text-2xl text-ink">{formatPercent(row.probability)}</strong>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-trophy transition-all"
                  style={{ width: `${Math.max(2, row.probability * 100)}%` }}
                />
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {row.topTeams.map((teamRow) => (
                  <div key={teamRow.team.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm font-bold">
                    <span className="min-w-0 truncate">
                      <span className="mr-2">{teamRow.team.flag}</span>
                      {teamRow.team.name}
                    </span>
                    <span className={teamRow.probability > 0 ? "text-green-700" : "text-slate-400"}>
                      {formatPercent(teamRow.probability)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/95 p-4 text-ink md:p-6">
        <h3 className="text-2xl font-black">Por qué salen esos porcentajes</h3>
        <div className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-600">
          <p>
            El cálculo usa la llave actual y suma la probabilidad de campeón de todos los equipos que tiene cada dueño.
          </p>
          <p>
            Los partidos finalizados cuentan como resultado fijo: el ganador avanza con 100% y el perdedor queda sin ruta al título, salvo que tenga un partido pendiente de tercer lugar.
          </p>
          <p>
            En partidos pendientes ya no se usa 50/50: la app estima la probabilidad con una fuerza base tipo Elo/FIFA, la forma del Mundial capturada en los marcadores, localía ligera para anfitriones y ajustes de antecedentes entre selecciones cuando existe historial relevante.
          </p>
          <p>
            No son momios oficiales. Es un modelo transparente para el fantasy: combina datos históricos, resultados actuales y la ruta de cruces que queda por jugar.
          </p>
        </div>
      </div>
    </section>
  );
}

function MatchCard({
  match,
  state,
  setState,
  compact = false,
}: {
  match: Match;
  state: DraftState;
  setState: React.Dispatch<React.SetStateAction<DraftState>>;
  compact?: boolean;
}) {
  const teamA = match.teamAId ? state.teams.find((team) => team.id === match.teamAId) : undefined;
  const teamB = match.teamBId ? state.teams.find((team) => team.id === match.teamBId) : undefined;
  const winnerOptions = [teamA, teamB].filter(Boolean) as Team[];
  const scheduleText = formatMatchSchedule(match);
  const venueText = [match.venue, match.city].filter(Boolean).join(" · ");

  return (
    <article className="rounded-lg border border-white/10 bg-white/95 p-4 text-ink">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-600">{match.round}</span>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
          <CalendarDays size={14} /> {scheduleText}
        </span>
      </div>
      {venueText && <p className="mb-3 text-xs font-bold uppercase text-slate-500">{venueText}</p>}
      <MatchTeamLine team={teamA} state={state} score={match.scoreA} winner={match.winnerTeamId === teamA?.id} />
      <MatchTeamLine team={teamB} state={state} score={match.scoreB} winner={match.winnerTeamId === teamB?.id} />

      {!compact && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input
            aria-label="Marcador A"
            type="number"
            min="0"
            value={match.scoreA ?? ""}
            onChange={(event) => setState((draft) => updateMatch(draft, match.id, { scoreA: Number(event.target.value) }))}
            className="rounded-md border border-slate-200 bg-white px-2 py-2 text-ink"
          />
          <input
            aria-label="Marcador B"
            type="number"
            min="0"
            value={match.scoreB ?? ""}
            onChange={(event) => setState((draft) => updateMatch(draft, match.id, { scoreB: Number(event.target.value) }))}
            className="rounded-md border border-slate-200 bg-white px-2 py-2 text-ink"
          />
          <select
            value={match.status}
            onChange={(event) => setState((draft) => changeMatchStatus(draft, match.id, event.target.value as MatchStatus))}
            className="rounded-md border border-slate-200 bg-white px-2 py-2 text-ink"
          >
            {Object.entries(matchStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={match.winnerTeamId ?? ""}
            onChange={(event) => setState((draft) => updateMatch(draft, match.id, { winnerTeamId: event.target.value || undefined }))}
            className="rounded-md border border-slate-200 bg-white px-2 py-2 text-ink"
          >
            <option value="">Ganador</option>
            {winnerOptions.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <button onClick={() => setState((draft) => simulateMatch(draft, match.id))} className="rounded-md bg-ink px-3 py-2 font-black text-white">
            Simular
          </button>
        </div>
      )}
      <div className="mt-3 text-xs font-black uppercase text-slate-500">
        Estado: {matchStatusLabels[match.status]} {match.winnerTeamId ? `· Ganador: ${state.teams.find((team) => team.id === match.winnerTeamId)?.name}` : ""}
      </div>
    </article>
  );
}

function MatchTeamLine({ team, state, score, winner }: { team?: Team; state: DraftState; score?: number; winner: boolean }) {
  const owner = team?.ownerId ? participantById(state, team.ownerId) : undefined;
  return (
    <div className={`my-2 flex items-center justify-between rounded-md border px-3 py-2 ${winner ? "border-trophy bg-yellow-50" : "border-slate-200 bg-white"}`}>
      <div className="min-w-0">
        <p className="truncate font-black">
          <span className="mr-2 text-2xl">{team?.flag ?? "🏳️"}</span>
          {team?.name ?? "Por definir"}
        </p>
        <p className="text-xs font-bold text-slate-500">{owner ? `Dueño: ${owner.name}` : "Sin dueño"}</p>
      </div>
      <strong className="text-2xl">{score ?? "-"}</strong>
    </div>
  );
}

function formatMatchSchedule(match: Match) {
  const date = new Date(match.date);
  const dateText = date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: match.timezone ?? "America/Mexico_City",
  });
  return match.time ? `${dateText} · ${match.time} CDMX` : `${dateText} · hora por definir`;
}

function PickHistory({ state }: { state: DraftState }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 p-4">
      <h3 className="mb-3 text-lg font-black">Historial de Picks</h3>
      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {[...state.picks].reverse().map((pick) => {
          const team = state.teams.find((item) => item.id === pick.teamId);
          const participant = participantById(state, pick.participantId);
          return (
            <div key={pick.pickNumber} className="rounded-md bg-white/95 p-3 text-ink">
              <div className="flex items-center justify-between gap-2">
                <strong>#{pick.pickNumber} {team?.flag} {team?.name}</strong>
                <span className={`rounded-full px-2 py-1 text-xs font-black ${pick.pickType === "manual" ? "bg-turf text-ink" : "bg-coral text-white"}`}>
                  {pick.pickType === "manual" ? "Manual" : "Auto"}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500">Ronda {pick.round} · {participant.name}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImportExportPanel({ state, importJson }: { state: DraftState; importJson: (file?: File) => void }) {
  const [exportedJson, setExportedJson] = useState("");
  const [copied, setCopied] = useState(false);
  const exportHref = exportedJson ? `data:application/json;charset=utf-8,${encodeURIComponent(exportedJson)}` : "";

  function handleExport() {
    const json = exportState(state);
    setExportedJson(json);
    setCopied(false);
  }

  async function copyExport() {
    if (!exportedJson) return;
    await navigator.clipboard.writeText(exportedJson);
    setCopied(true);
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/10 p-4">
      <h3 className="mb-3 text-lg font-black">Estado JSON</h3>
      <div className="flex flex-wrap gap-2">
        <button onClick={handleExport} className="inline-flex items-center gap-2 rounded-md bg-trophy px-3 py-2 font-black text-ink">
          <Download size={16} /> Exportar
        </button>
        {exportedJson && (
          <>
            <a
              href={exportHref}
              download="world-cup-fantasy-draft.json"
              className="inline-flex items-center gap-2 rounded-md bg-turf px-3 py-2 font-black text-ink"
            >
              Descargar JSON
            </a>
            <button onClick={copyExport} className="rounded-md bg-slate-900 px-3 py-2 font-black text-white">
              {copied ? "Copiado" : "Copiar JSON"}
            </button>
          </>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 font-black text-ink">
          <Upload size={16} /> Importar
          <input type="file" accept="application/json" className="hidden" onChange={(event) => importJson(event.target.files?.[0])} />
        </label>
      </div>
      {exportedJson && (
        <textarea
          readOnly
          value={exportedJson}
          className="mt-3 h-28 w-full resize-y rounded-md border border-white/15 bg-ink p-3 text-xs text-white"
          aria-label="JSON exportado"
        />
      )}
    </div>
  );
}

function TeamRow({ team, state }: { team: Team; state: DraftState }) {
  const owner = team.ownerId ? participantById(state, team.ownerId) : undefined;
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
      <div>
        <p className="font-black"><span className="mr-2 text-2xl">{team.flag}</span>{team.name}</p>
        <p className="text-xs font-bold text-slate-500">{owner?.name ?? "Sin dueño"}</p>
      </div>
      <span className={`rounded-full px-2 py-1 text-xs font-black ${team.status === "champion" ? "bg-trophy text-ink" : team.status === "eliminated" ? "bg-slate-200 text-slate-600" : "bg-turf/20 text-green-800"}`}>
        {statusLabels[team.status]}
      </span>
    </div>
  );
}

function ParticipantBadge({
  participantId,
  state,
  active = false,
  compact = false,
  forceLight = false,
}: {
  participantId: ParticipantId;
  state: DraftState;
  active?: boolean;
  compact?: boolean;
  forceLight?: boolean;
}) {
  const participant = participantById(state, participantId);
  const total = state.teams.filter((team) => team.ownerId === participantId).length;
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        forceLight ? "border-slate-200 bg-white text-ink" : active ? "border-trophy bg-trophy/20 text-white" : "border-white/10 bg-white/10 text-white"
      } ${compact ? "min-w-0" : ""}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black text-ink" style={{ background: participant.color }}>
        {participant.avatar}
      </span>
      <div className="min-w-0">
        <p className="truncate font-black">{participant.name}</p>
        <p className={`text-xs font-bold ${forceLight ? "text-slate-500" : "text-white/60"}`}>{total} equipos</p>
      </div>
    </div>
  );
}

function getParticipantForPick(pickIndex: number): ParticipantId {
  const roundIndex = Math.floor(pickIndex / DRAFT_ORDER.length);
  const position = pickIndex % DRAFT_ORDER.length;
  const order = roundIndex % 2 === 0 ? DRAFT_ORDER : [...DRAFT_ORDER].reverse();
  return order[position];
}

function participantById(state: DraftState, id: ParticipantId) {
  return state.participants.find((participant) => participant.id === id) ?? PARTICIPANTS.find((participant) => participant.id === id) ?? PARTICIPANTS[0];
}

function calculateChampionProbabilities(state: DraftState) {
  const matchesById = new Map(state.matches.map((match) => [match.id, match]));
  const memo = new Map<string, Record<string, number>>();
  const finalMatch = state.matches.find((match) => match.round === "Final");

  function mergeDistribution(target: Record<string, number>, source: Record<string, number>, multiplier = 1) {
    Object.entries(source).forEach(([teamId, probability]) => {
      target[teamId] = (target[teamId] ?? 0) + probability * multiplier;
    });
    return target;
  }

  function entryDistribution(match: Match, slot: "A" | "B"): Record<string, number> {
    const teamId = slot === "A" ? match.teamAId : match.teamBId;
    if (teamId) return { [teamId]: 1 };

    return state.matches
      .filter((source) => source.nextMatchId === match.id && source.nextSlot === slot)
      .reduce((distribution, source) => mergeDistribution(distribution, winnerDistribution(source.id)), {} as Record<string, number>);
  }

  function winnerDistribution(matchId: string): Record<string, number> {
    const cached = memo.get(matchId);
    if (cached) return cached;

    const match = matchesById.get(matchId);
    if (!match) return {};

    if (match.status === "finished" && match.winnerTeamId) {
      const distribution = { [match.winnerTeamId]: 1 };
      memo.set(matchId, distribution);
      return distribution;
    }

    const left = entryDistribution(match, "A");
    const right = entryDistribution(match, "B");
    const leftEntries = Object.entries(left);
    const rightEntries = Object.entries(right);
    const distribution: Record<string, number> = {};

    if (leftEntries.length === 0 && rightEntries.length === 0) {
      memo.set(matchId, distribution);
      return distribution;
    }
    if (rightEntries.length === 0) {
      mergeDistribution(distribution, left);
      memo.set(matchId, distribution);
      return distribution;
    }
    if (leftEntries.length === 0) {
      mergeDistribution(distribution, right);
      memo.set(matchId, distribution);
      return distribution;
    }

    leftEntries.forEach(([leftTeamId, leftProbability]) => {
      rightEntries.forEach(([rightTeamId, rightProbability]) => {
        const matchupProbability = teamWinProbability(leftTeamId, rightTeamId, state, match);
        const scenarioProbability = leftProbability * rightProbability;
        distribution[leftTeamId] = (distribution[leftTeamId] ?? 0) + scenarioProbability * matchupProbability;
        distribution[rightTeamId] = (distribution[rightTeamId] ?? 0) + scenarioProbability * (1 - matchupProbability);
      });
    });

    memo.set(matchId, distribution);
    return distribution;
  }

  const teamProbabilities = finalMatch ? winnerDistribution(finalMatch.id) : {};
  const participantRows = state.participants
    .map((participant) => {
      const ownedTeams = state.teams.filter((team) => team.ownerId === participant.id);
      const topTeams = ownedTeams
        .map((team) => ({ team, probability: teamProbabilities[team.id] ?? 0 }))
        .sort((a, b) => b.probability - a.probability || a.team.name.localeCompare(b.team.name));
      const probability = topTeams.reduce((total, row) => total + row.probability, 0);

      return {
        participant,
        probability,
        liveTeams: topTeams.filter((row) => row.probability > 0).length,
        topTeams,
      };
    })
    .sort((a, b) => b.probability - a.probability);

  return { teamProbabilities, participantRows };
}

function formatPercent(probability: number) {
  if (probability > 0 && probability < 0.001) return "<0.1%";
  return `${(probability * 100).toFixed(1)}%`;
}

function teamWinProbability(teamAId: string, teamBId: string, state: DraftState, match: Match) {
  const scoreA =
    teamPower(teamAId, state) +
    headToHeadAdjustment(teamAId, teamBId) +
    venueAdjustment(teamAId, match);
  const scoreB =
    teamPower(teamBId, state) +
    headToHeadAdjustment(teamBId, teamAId) +
    venueAdjustment(teamBId, match);
  const probability = 1 / (1 + 10 ** ((scoreB - scoreA) / 400));
  return Math.min(0.82, Math.max(0.18, probability));
}

function teamPower(teamId: string, state: DraftState) {
  return (TEAM_STRENGTH[teamId] ?? 1600) + tournamentFormBonus(teamId, state);
}

function tournamentFormBonus(teamId: string, state: DraftState) {
  const playedMatches = state.matches.filter(
    (match) =>
      match.status === "finished" &&
      match.winnerTeamId &&
      (match.teamAId === teamId || match.teamBId === teamId),
  );

  return playedMatches.reduce((bonus, match) => {
    const isTeamA = match.teamAId === teamId;
    const goalsFor = isTeamA ? match.scoreA : match.scoreB;
    const goalsAgainst = isTeamA ? match.scoreB : match.scoreA;
    const goalDifference =
      typeof goalsFor === "number" && typeof goalsAgainst === "number" ? goalsFor - goalsAgainst : 0;
    const resultBonus = match.winnerTeamId === teamId ? 26 : -30;
    const marginBonus = Math.max(-18, Math.min(24, goalDifference * 8));
    return bonus + resultBonus + marginBonus;
  }, 0);
}

function headToHeadAdjustment(teamAId: string, teamBId: string) {
  const direct = HEAD_TO_HEAD_BONUS[`${teamAId}|${teamBId}`];
  if (typeof direct === "number") return direct;
  const reverse = HEAD_TO_HEAD_BONUS[`${teamBId}|${teamAId}`];
  if (typeof reverse === "number") return -reverse;
  return 0;
}

function venueAdjustment(teamId: string, match: Match) {
  const hostBonus = HOST_BONUS[teamId] ?? 0;
  if (!hostBonus || !match.city) return 0;
  if (teamId === "usa" && /New York|Atlanta|Dallas|Houston|Seattle|Kansas City|Los Angeles|Miami|Philadelphia|Boston|San Francisco/i.test(match.city)) return hostBonus;
  if (teamId === "mexico" && /Ciudad de México|Monterrey|Guadalajara/i.test(match.city)) return hostBonus;
  if (teamId === "canada" && /Toronto|Vancouver/i.test(match.city)) return hostBonus;
  return 0;
}

function isDraftComplete(state: DraftState) {
  return state.completed || state.picks.length >= state.teams.length || state.teams.every((team) => Boolean(team.ownerId));
}

function getDeterministicAutomaticTeam(openTeams: Team[], state: DraftState) {
  const seed = `${state.picks.length}:${state.turnStartedAt ?? ""}:${state.draftDuration}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return openTeams[hash % openTeams.length];
}

function getClientId() {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

function getVisibleSecondsLeft(state: DraftState, now = Date.now()) {
  if (!state.started || state.paused || state.completed || !state.turnStartedAt) {
    return Math.min(state.draftDuration, Math.max(0, state.secondsLeft));
  }

  const startedAt = Date.parse(state.turnStartedAt);
  if (Number.isNaN(startedAt)) {
    return Math.min(state.draftDuration, Math.max(0, state.secondsLeft));
  }

  const elapsedSeconds = Math.floor((now - startedAt) / 1000);
  return Math.max(0, state.draftDuration - elapsedSeconds);
}

function isPastAutomaticGrace(state: DraftState, now = Date.now()) {
  if (!state.turnStartedAt) return false;
  const startedAt = Date.parse(state.turnStartedAt);
  if (Number.isNaN(startedAt)) return false;
  return now - startedAt >= state.draftDuration * 1000 + 1500;
}

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | undefined;

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return undefined;
  audioContext = new AudioContextConstructor();
  return audioContext;
}

function primeAudio() {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume();
  }
}

function playTone(frequency: number, duration = 0.16, delay = 0, type: OscillatorType = "sine", volume = 0.08) {
  const context = getAudioContext();
  if (!context) return;
  void context.resume();

  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playTwentySecondSound() {
  playTone(660, 0.14, 0, "triangle", 0.07);
  playTone(880, 0.18, 0.16, "triangle", 0.07);
}

function playCountdownSound(second: number) {
  playTone(second <= 3 ? 1040 : 760, second <= 3 ? 0.18 : 0.09, 0, "square", second <= 3 ? 0.06 : 0.04);
}

function playRandomPickSound() {
  playTone(220, 0.14, 0, "sawtooth", 0.07);
  playTone(392, 0.14, 0.14, "sawtooth", 0.07);
  playTone(740, 0.2, 0.29, "triangle", 0.08);
}

function playPickConfirmedSound() {
  playTone(520, 0.11, 0, "triangle", 0.06);
  playTone(780, 0.16, 0.12, "triangle", 0.06);
}

function playDraftCompleteSound() {
  playTone(523, 0.14, 0, "triangle", 0.07);
  playTone(659, 0.14, 0.15, "triangle", 0.07);
  playTone(784, 0.2, 0.3, "triangle", 0.08);
}

function playDraftStartSound() {
  playTone(392, 0.12, 0, "triangle", 0.07);
  playTone(523, 0.12, 0.13, "triangle", 0.07);
  playTone(659, 0.18, 0.26, "triangle", 0.08);
}

function speakText(text: string) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 1;
  utterance.volume = 0.8;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function eligibleMoneyMatch(state: DraftState, match: Match) {
  if (match.status !== "finished" || !match.winnerTeamId || !match.teamAId || !match.teamBId) return undefined;
  const winner = state.teams.find((team) => team.id === match.winnerTeamId);
  const loserTeamId = match.teamAId === match.winnerTeamId ? match.teamBId : match.teamAId;
  const loser = state.teams.find((team) => team.id === loserTeamId);
  if (!winner?.ownerId || !loser?.ownerId || winner.ownerId === loser.ownerId) return undefined;
  return { winnerOwnerId: winner.ownerId, loserOwnerId: loser.ownerId };
}

function moneyForParticipant(state: DraftState, participantId: ParticipantId) {
  return state.matches.reduce(
    (totals, match) => {
      const moneyMatch = eligibleMoneyMatch(state, match);
      if (!moneyMatch) return totals;
      return {
        moneyWon: totals.moneyWon + (moneyMatch.winnerOwnerId === participantId ? 50 : 0),
        moneyOwed: totals.moneyOwed + (moneyMatch.loserOwnerId === participantId ? 100 : 0),
        moneyNet:
          totals.moneyNet +
          (moneyMatch.winnerOwnerId === participantId ? 50 : 0) -
          (moneyMatch.loserOwnerId === participantId ? 100 : 0),
      };
    },
    { moneyWon: 0, moneyOwed: 0, moneyNet: 0 },
  );
}

function moneyPotTotal(state: DraftState) {
  return state.matches.reduce((total, match) => total + (eligibleMoneyMatch(state, match) ? 50 : 0), 0);
}

function pointsForTeam(team: Team) {
  if (team.status === "champion") return 10;
  if (team.highestRound >= 4) return 7;
  if (team.highestRound >= 3) return 4;
  if (team.highestRound >= 2) return 2;
  if (team.highestRound >= 1) return 1;
  return 0;
}
