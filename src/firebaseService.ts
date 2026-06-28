import { initializeApp } from "firebase/app";
import { doc, getDoc, getFirestore, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { createInitialState } from "./data";
import { normalizeState } from "./storage";
import type { DraftState } from "./types";

const firebaseConfig = {
  apiKey: "AIzaSyCp9vufngfUvTZnbaSOvpyoPxMjW48OMrk",
  authDomain: "mundialfantasy2026.firebaseapp.com",
  projectId: "mundialfantasy2026",
  storageBucket: "mundialfantasy2026.firebasestorage.app",
  messagingSenderId: "9572489012",
  appId: "1:9572489012:web:08b053c287a20038b63761",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const draftRef = doc(db, "draftRooms", "world-cup-2026");

function cleanStateForFirestore(state: DraftState) {
  return JSON.parse(JSON.stringify(state)) as DraftState;
}

export async function ensureRemoteDraftState(localState: DraftState) {
  const snapshot = await getDoc(draftRef);
  if (snapshot.exists()) {
    return normalizeState(snapshot.data().state);
  }

  const initialState = cleanStateForFirestore(localState ?? createInitialState());
  await setDoc(draftRef, {
    state: initialState,
    updatedAt: serverTimestamp(),
  });
  return normalizeState(initialState);
}

export function subscribeToRemoteDraftState(
  onState: (state: DraftState) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    draftRef,
    (snapshot) => {
      if (!snapshot.exists()) return;
      onState(normalizeState(snapshot.data().state));
    },
    onError,
  );
}

export async function saveRemoteDraftState(state: DraftState) {
  await setDoc(
    draftRef,
    {
      state: cleanStateForFirestore(state),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
