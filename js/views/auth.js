import { esc } from "../format.js";

export function authHtml(mode, error = "") {
  const register = mode === "register";
  return `<section class="auth">
    <div class="auth-copy">
      <p class="brand-lockup"><span class="brand-mark">Sm</span> StudyMantra</p>
      <h1>The HSC ledger for Class 11 and 12.</h1>
      <p class="lede">Ninety-five PCM chapters. Ten stages each. Readiness that cares more about PYQs, revisions, and tests than about ticking theory.</p>
      <ol class="auth-steps">
        <li><span>01</span><div><b>Year, subject, chapter</b><small>Balbharati 2026–27, both classes.</small></div></li>
        <li><span>02</span><div><b>Backlog through final</b><small>Dates stamp themselves. Revision schedules itself.</small></div></li>
        <li><span>03</span><div><b>A plan for today</b><small>Due revisions, weak topics, then the next untouched chapter.</small></div></li>
      </ol>
    </div>
    <form class="auth-card" data-form="${register ? "register" : "login"}">
      <h2>${register ? "Create your ledger" : "Welcome back"}</h2>
      <p class="muted">${register ? "The account is ready immediately. No approval queue." : "Pick up the same ledger on any browser."}</p>
      ${error ? `<p class="form-error" role="alert">${esc(error)}</p>` : ""}
      ${register ? `<label class="field"><span>Name</span><input name="name" autocomplete="name" required minlength="2" maxlength="80"></label>` : ""}
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" required minlength="8"></label>
      <button class="btn btn-primary btn-block" type="submit">${register ? "Create account" : "Sign in"}</button>
      <p class="auth-switch">${register ? `Already tracking? <a href="#/login">Sign in</a>` : `New here? <a href="#/register">Create an account</a>`}</p>
    </form>
  </section>`;
}
