import { esc } from "../format.js";

export function authHtml(mode, error = "", extra = {}) {
  const register = mode === "register";
  const approve = mode === "approve";
  const requested = mode === "requested";
  const email = extra.email || "";
  const heading = requested
    ? "Request received"
    : approve
      ? "Enter your code"
      : register
        ? "Request a ledger"
        : "Welcome back";
  const lede = requested
    ? "Sham reviews each request. When this one is approved, you will receive a short code. Enter that code to open the ledger. You do not need to register again."
    : approve
      ? "Use the email from your request and the code Sham sent you. It looks like ABCD-2345."
      : register
        ? "The password is saved with the request. The ledger opens only after Sham approves it and you enter the code."
        : "Pick up the same ledger on any browser.";
  const form = requested
    ? ""
    : approve
      ? "redeem"
      : register
        ? "register"
        : "login";

  return `<section class="auth">
    <div class="auth-copy">
      <p class="brand-lockup"><span class="brand-mark">Sm</span> StudyMantra</p>
      <h1>The HSC ledger for Class 11 and 12.</h1>
      <p class="lede">Ninety-five PCM chapters. Ten stages each. Readiness that cares more about PYQs, revisions, and tests than about ticking theory.</p>
      <ol class="auth-steps">
        <li><span>01</span><div><b>Request a ledger</b><small>Name, email, and a password. Nothing opens yet.</small></div></li>
        <li><span>02</span><div><b>Sham sends a code</b><small>Approval is by hand. The code lasts 14 days.</small></div></li>
        <li><span>03</span><div><b>Enter the code once</b><small>After that, sign in with the password you chose.</small></div></li>
      </ol>
    </div>
    ${requested ? `<div class="auth-card">` : `<form class="auth-card" data-form="${form}">`}
      <h2>${heading}</h2>
      <p class="muted">${lede}</p>
      ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ""}
      ${requested && email ? `<p class="auth-email">Requested as <b>${esc(email)}</b></p>` : ""}
      ${register ? `<label class="field"><span>Name</span><input name="name" autocomplete="name" required minlength="2" maxlength="80"></label>` : ""}
      ${requested ? "" : `<label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required value="${esc(email)}"></label>`}
      ${approve ? `<label class="field"><span>Code</span><input name="code" autocomplete="one-time-code" required minlength="8" maxlength="12" placeholder="ABCD-2345" spellcheck="false"></label>` : ""}
      ${requested || approve ? "" : `<label class="field"><span>Password</span><input name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" required minlength="8"></label>`}
      ${requested ? `<a class="btn btn-primary btn-block" href="#/approve">I have a code</a>` : `<button class="btn btn-primary btn-block" type="submit">${approve ? "Open my ledger" : register ? "Request account" : "Sign in"}</button>`}
      <p class="auth-switch">${switchCopy(mode)}</p>
    ${requested ? `</div>` : `</form>`}
  </section>`;
}

function switchCopy(mode) {
  if (mode === "requested") return `<a href="#/login">Back to sign in</a>`;
  if (mode === "register") return `Already approved? <a href="#/login">Sign in</a> · <a href="#/approve">Enter a code</a>`;
  if (mode === "approve") return `<a href="#/register">Request a ledger</a> · <a href="#/login">Sign in</a>`;
  return `New here? <a href="#/register">Request a ledger</a> · <a href="#/approve">I have a code</a>`;
}
