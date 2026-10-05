import { selectChapters } from "./syllabus.js";
import { getChapter, todayISO } from "./engine.js";
import { getData, putChapter } from "./store.js";
import { toast } from "./toast.js";

let mode = "focus";
let running = false;
let endsAt = 0;
let remaining = 25 * 60;
let focusedMs = 0;
let sliceStart = 0;
let handle = null;
let onLogged = () => {};

export function onTimerLogged(fn) {
  onLogged = fn;
}

export function startClock() {
  if (handle) return;
  handle = setInterval(paint, 250);
  syncLengths();
}

export function syncLengths() {
  const settings = getData()?.settings;
  if (!settings || running || focusedMs > 0) return;
  remaining = (mode === "focus" ? settings.pomodoroMin : settings.breakMin) * 60;
  paint();
}

export function toggleTimer() {
  if (running) pause();
  else start();
}

export function resetTimer() {
  pause();
  focusedMs = 0;
  mode = "focus";
  const settings = getData()?.settings;
  remaining = (settings?.pomodoroMin || 25) * 60;
  paint();
}

function start() {
  if (remaining <= 0) flip();
  running = true;
  endsAt = Date.now() + remaining * 1000;
  if (mode === "focus") sliceStart = Date.now();
  paint();
}

function pause() {
  if (!running) return;
  captureSlice();
  remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
  running = false;
  paint();
}

function captureSlice() {
  if (mode === "focus" && sliceStart) {
    focusedMs += Math.max(0, Date.now() - sliceStart);
    sliceStart = 0;
  }
}

function flip() {
  captureSlice();
  const finished = mode;
  mode = mode === "focus" ? "break" : "focus";
  const settings = getData()?.settings || { pomodoroMin: 25, breakMin: 5 };
  remaining = (mode === "focus" ? settings.pomodoroMin : settings.breakMin) * 60;
  running = false;
  paint();
  const message = finished === "focus" ? "Focus block done. Take the break, or log the session." : "Break over. Start the next block when you are ready.";
  toast(message);
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    new Notification("StudyMantra", { body: message });
  }
}

function paint() {
  if (running && Date.now() >= endsAt) flip();
  const left = running ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : remaining;
  const text = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
  const readout = document.querySelector("[data-timer-readout]");
  if (readout) readout.textContent = `${mode === "focus" ? "Focus" : "Break"} ${text}`;
  const clock = document.getElementById("timer-clock");
  if (clock) clock.textContent = text;
  const label = document.getElementById("timer-mode");
  if (label) label.textContent = mode === "focus" ? "Focus" : "Break";
  const run = document.querySelector("[data-action='timer-run']");
  if (run) run.textContent = running ? "Pause" : "Start";
}

export function logFocusSession() {
  captureSlice();
  if (running) pause();
  const minutes = Math.round(focusedMs / 60000);
  if (minutes < 1) {
    toast("Focus for at least a minute before logging.");
    return false;
  }
  const subjectId = document.getElementById("timer-subject")?.value || "";
  const chapterId = document.getElementById("timer-chapter")?.value || "";
  if (!subjectId || !chapterId || !selectChapters({ subjectId }).some((chapter) => chapter.id === chapterId)) {
    toast("Choose a subject and chapter first.");
    return false;
  }
  const end = new Date();
  const start = new Date(end.getTime() - minutes * 60000);
  const pad = (date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const data = getData();
  data.logs.unshift({
    id: crypto.randomUUID(),
    date: todayISO(),
    subjectId,
    chapterId,
    start: pad(start),
    end: pad(end),
    attempted: 0,
    correct: 0,
    achievement: "Focus session",
    problem: "",
    nextAction: "",
  });
  const chapter = getChapter(data, chapterId);
  chapter.lastStudied = todayISO();
  putChapter(chapterId, chapter);
  focusedMs = 0;
  toast(`Logged ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  onLogged();
  return true;
}
