import { useState } from "react";

export function SignInPanel({
  setup,
  busy,
  onSubmit,
  onLocal,
}: {
  setup: boolean;
  busy: boolean;
  onSubmit: (credentials: {
    email: string;
    password: string;
    display_name: string;
    token: string;
  }) => Promise<boolean>;
  onLocal: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  return (
    <div className="workspace-login">
      <div className="login-story">
        <span className="eyebrow">YOUR COLLABORATIVE GAME STUDIO</span>
        <h2>
          Build a world.
          <br />
          Make every choice count.
        </h2>
        <p>
          Write together, play through your story, and prepare your next game
          for release.
        </p>
        <div className="login-art" aria-hidden="true">
          <div>
            ✦<span>A world to discover</span>
          </div>
          <div>
            ↔<span>A choice to make</span>
          </div>
          <div>
            ◈<span>A story to share</span>
          </div>
        </div>
        <p className="login-caption">One workspace for your whole team.</p>
      </div>
      <form
        className="login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await onSubmit({
              email: email.trim(),
              password,
              display_name: name.trim(),
              token,
            })
          ) {
            setPassword("");
            setToken("");
            setVisible(false);
          }
        }}
      >
        <span className="eyebrow">GAME FACTORY</span>
        <h2>{setup ? "Set up your workspace" : "Welcome back"}</h2>
        <p>
          {setup
            ? "Create the first administrator account using your installation token."
            : "Sign in to find your games and collaborate with your team."}
        </p>
        <fieldset disabled={busy}>
          <legend className="sr-only">
            {setup ? "Create administrator" : "Sign in"}
          </legend>
          {setup && (
            <>
              <label>
                Display name
                <input
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Setup token
                <input
                  autoComplete="off"
                  type="password"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
            </>
          )}
          <label>
            Email address
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <span className="password-control">
              <input
                name="password"
                type={visible ? "text" : "password"}
                autoComplete={setup ? "new-password" : "current-password"}
                minLength={setup ? 12 : 1}
                maxLength={72}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                aria-label={visible ? "Hide password" : "Show password"}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          <button className="primary login-submit" type="submit">
            {busy ? "Signing in…" : setup ? "Create workspace" : "Sign in"}
          </button>
        </fieldset>
        {!setup && (
          <details className="login-help">
            <summary>Need an account or forgot your password?</summary>
            <p>
              Ask your workspace administrator to create your account or reset
              your password. There is no email reset service yet.
            </p>
          </details>
        )}
        <div className="login-local">
          <span>Working on this computer only?</span>
          <button type="button" disabled={busy} onClick={onLocal}>
            Continue with local drafts →
          </button>
        </div>
      </form>
    </div>
  );
}
