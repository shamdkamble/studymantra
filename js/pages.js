import { subjectById } from "./syllabus.js";
import { dashboardPage, pcmPage } from "./views/home.js";
import { subjectPage } from "./views/subject.js";
import { backlogPage, revisionPage } from "./views/trackers.js";
import { cardsPage, errorsPage, logPage, mocksPage, testsPage, weekPage } from "./views/records.js";
import { documentsPage } from "./views/documents.js";
import { settingsPage } from "./views/settings.js";
import { authHtml } from "./views/auth.js";

export function pageHtml(current) {
  switch (current.name) {
    case "pcm": return pcmPage();
    case "subject": return subjectPage(current);
    case "backlog": return backlogPage();
    case "revision": return revisionPage();
    case "tests": return testsPage();
    case "errors": return errorsPage();
    case "log": return logPage();
    case "documents": return documentsPage();
    case "week": return weekPage();
    case "cards": return cardsPage();
    case "mocks": return mocksPage();
    case "settings": return settingsPage();
    default: return dashboardPage();
  }
}

export function authScreen(current, error) {
  const sent = current.name === "register" && current.query.get("sent") === "1";
  const mode = sent ? "requested" : current.name === "approve" ? "approve" : current.name === "register" ? "register" : "login";
  const email = current.query.get("email") || "";
  document.getElementById("app").innerHTML = authHtml(mode, error, { email });
}

export function titleFor(current) {
  if (current.name === "subject") {
    const subject = subjectById(current.parts[2]);
    return subject ? `${subject.short}, Class ${current.parts[1]}` : "Subject";
  }
  const titles = {
    dashboard: "Dashboard",
    pcm: "PCM",
    backlog: "Backlog",
    revision: "Revision",
    tests: "Tests",
    errors: "Error log",
    log: "Study log",
    documents: "Documents",
    week: "Weekly",
    cards: "Flashcards",
    mocks: "CET mocks",
    settings: "Settings",
  };
  return titles[current.name] || "StudyMantra";
}
