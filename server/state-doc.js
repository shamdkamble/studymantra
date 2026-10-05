/**
 * Maps the ledger the browser knows onto the Mongo document.
 * `errors` is a reserved Mongoose path, so the error log is stored as errorItems.
 */

export function toStored(state, userId, clientUpdatedAt) {
  return {
    userId,
    clientUpdatedAt,
    version: state.version,
    chapters: state.chapters,
    tests: state.tests,
    errorItems: state.errors,
    logs: state.logs,
    mocks: state.mocks,
    cards: state.cards,
    settings: state.settings,
  };
}

export function fromStored(doc) {
  if (!doc) return null;
  const errors = Array.isArray(doc.errorItems) ? doc.errorItems : doc.errors;
  return {
    version: doc.version,
    chapters: doc.chapters,
    tests: doc.tests,
    errors,
    logs: doc.logs,
    mocks: doc.mocks,
    cards: doc.cards,
    settings: doc.settings,
  };
}
