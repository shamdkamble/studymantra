export const PUBLIC = new Set(["login", "register", "approve"]);

export function route() {
  const raw = (location.hash || "#/dashboard").replace(/^#/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return {
    name: parts[0] || "dashboard",
    parts,
    query: new URLSearchParams(query),
    hash: location.hash || "#/dashboard",
  };
}

export function pageTitle(current) {
  const titles = {
    dashboard: "Dashboard",
    pcm: "PCM",
    backlog: "Backlog",
    revision: "Revision",
    tests: "Tests",
    errors: "Error log",
    log: "Study log",
    week: "Weekly",
    cards: "Flashcards",
    mocks: "CET mocks",
    settings: "Settings",
    login: "Sign in",
    register: "Request a ledger",
    approve: "Enter code",
    admin: "Desk",
  };
  return titles[current.name] || "StudyMantra";
}
