// Task 7 (Session 3) — Promo Footer.
//
// Server Component. No "use client", no Convex imports.
//
// Three items (Req 7 / Design §C4 §5):
//   1. Repo link.
//   2. AGENTS.md hard-constraints link (so a Fork_Developer sees the
//      approval-checkpoint constraints before shipping).
//   3. A short license/copyright line.
//
// The AGENTS.md link points at the top-level file in the GitHub repo — a
// stranger reading the promo page can jump straight to the hard constraints
// without cloning first. Kept case-lowercase ("agents.md") to match the
// actual filename on disk.

const REPO_URL = "https://github.com/bryanseah234/sgCampusCore2026";
const AGENTS_URL =
  "https://github.com/bryanseah234/sgCampusCore2026/blob/main/agents.md";

export default function Footer() {
  return (
    <footer className="landing-footer">
      <p>
        CampusCore is a student hackathon project. Provided as-is, MIT
        license. Not affiliated with any university administration.
      </p>
      <p>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          GitHub repository
        </a>
        {" · "}
        <a href={AGENTS_URL} target="_blank" rel="noopener noreferrer">
          AGENTS.md constraints
        </a>
      </p>
      <p className="landing-footer-meta">
        &copy; {new Date().getFullYear()} CampusCore contributors · MIT
      </p>
    </footer>
  );
}
