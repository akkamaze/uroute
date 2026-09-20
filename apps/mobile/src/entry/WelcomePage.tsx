import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import "./entry.css";
import "./welcome-animation.css";

const ROUTE_PATH = "M54 66V146C54 184 80 210 114 210S174 184 174 146V124C174 87 202 66 238 66H304";

function WelcomeIllustration(): React.JSX.Element {
  return (
    <figure aria-label="A blue route curves through three stops." className="welcome-illustration">
      <svg aria-hidden="true" fill="none" viewBox="0 0 360 278">
        <path className="welcome-illustration__base" d={ROUTE_PATH} />
        <path className="welcome-illustration__route" d={ROUTE_PATH} pathLength="100" />

        <g className="welcome-stop welcome-stop--start">
          <circle cx="54" cy="66" fill="#ebf3ff" r="18" />
          <circle cx="54" cy="66" fill="#1677ff" r="7" />
        </g>

        <g className="welcome-stop welcome-stop--middle">
          <circle cx="174" cy="146" fill="#ffffff" r="12" />
          <circle cx="174" cy="146" fill="#1677ff" r="6" />
        </g>

        <g className="welcome-stop welcome-stop--end">
          <circle className="welcome-arrival" cx="304" cy="66" fill="#ebf3ff" r="22" />
          <circle cx="304" cy="66" fill="#ffffff" r="10" stroke="#1677ff" strokeWidth="4" />
        </g>
      </svg>
    </figure>
  );
}

export function WelcomePage(): React.JSX.Element {
  return (
    <main className="entry-shell entry-shell--welcome">
      <div className="welcome-page">
        <header className="welcome-header">
          <div aria-label="uroute" className="welcome-wordmark" role="img">
            <span>u</span>route
          </div>

          <span className="preview-badge">Preview</span>
        </header>

        <WelcomeIllustration />

        <section className="welcome-content">
          <h1>
            Your trip.
            <span>Your way.</span>
          </h1>

          <p>
            Choose your stops. Plan each day.
            <br />
            Keep your whole trip in one place.
          </p>

          <Link className="welcome-primary-action" to="/login">
            <span>Get started</span>
            <ArrowRight aria-hidden="true" size={20} strokeWidth={1.8} />
          </Link>
        </section>

        <footer className="welcome-footer">Interactive preview · sample trips</footer>
      </div>
    </main>
  );
}
