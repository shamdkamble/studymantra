import { bind } from "./actions.js";
import { renderCurrent } from "./render.js";
import { flush, setConflictHandler } from "./store.js";
import { onTimerLogged, startClock } from "./timer.js";
import { toast } from "./toast.js";

bind();
startClock();
onTimerLogged(() => renderCurrent({ keep: true }));
setConflictHandler(() => {
  toast("Another session saved this ledger, so that copy was loaded.");
  renderCurrent({ keep: true });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) flush();
});

window.addEventListener("hashchange", () => {
  document.body.classList.remove("nav-open");
  renderCurrent();
});

renderCurrent();
