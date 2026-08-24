import { formatInteractiveTickSeconds } from "@game-runtime/impl/interactiveSessionRun";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { gameplayTimeRemainingTicks } from "@player-web/impl/playerAppGameplay";
import { selectResultHeadline } from "@player-web/impl/resultHeadlines";
import type { HybridCcNativeLevel } from "./nativeLevel";
import { HYBRID_CC_V0_RULESET_LABEL } from "./uiModel";

interface HybridCcV0ResultSheetProps {
  level: HybridCcNativeLevel;
  onNext: () => void;
  onRetry: () => void;
  session: InteractiveGameSession;
}

export function HybridCcV0ResultSheet({ level, onNext, onRetry, session }: HybridCcV0ResultSheetProps) {
  const result = session.run.result;
  if (!result) return null;
  const headline = selectResultHeadline({
    attemptCount: 1,
    entropyKey: `${session.request.seriesFile}:${level.number}:${result.outcome}:${session.frame.snapshot.tick}`,
    result,
  });
  const score = result.score;

  return (
    <div className="modern-result-sheet__backdrop">
      <section aria-label="Level result" className="modern-result-sheet">
        <div className="modern-result-sheet__header">
          <p className="modern-section__eyebrow">Level {level.number}: {level.title}</p>
          <h2 className="modern-result-sheet__title">{headline}</h2>
        </div>

        {score ? (
          <section aria-label="Score calculation" className="modern-result-sheet__score">
            <p className="modern-result-sheet__score-title">Score</p>
            <div className="modern-result-sheet__score-equation">
              <div className="modern-result-sheet__score-term">
                <span className="modern-result-sheet__score-term-label">Base</span>
                <strong>{score.baseScore}</strong>
              </div>
              <span aria-hidden="true" className="modern-result-sheet__score-operator">+</span>
              <div className="modern-result-sheet__score-term">
                <span className="modern-result-sheet__score-term-label">Time bonus</span>
                <strong>{score.timeBonus}</strong>
              </div>
              <span aria-hidden="true" className="modern-result-sheet__score-operator">x</span>
              <div className="modern-result-sheet__score-term">
                <span className="modern-result-sheet__score-term-label">Clean run</span>
                <strong>{score.undoPenaltyMultiplier.toFixed(1)}</strong>
              </div>
              <span aria-hidden="true" className="modern-result-sheet__score-operator">=</span>
              <div className="modern-result-sheet__score-term modern-result-sheet__score-term--final">
                <span className="modern-result-sheet__score-term-label">Final</span>
                <div className="modern-result-sheet__score-final-line"><strong>{score.finalScore} pts</strong></div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="modern-result-sheet__panel modern-result-sheet__panel--summary">
          <div className="modern-result-sheet__rows modern-result-sheet__rows--summary">
            <div className="modern-result-sheet__row"><span>Ruleset</span><strong>{HYBRID_CC_V0_RULESET_LABEL}</strong></div>
            <div className="modern-result-sheet__row"><span>Time elapsed</span><strong>{formatInteractiveTickSeconds(Math.max(session.frame.snapshot.currentTime, 0))}s</strong></div>
            <div className="modern-result-sheet__row">
              <span>Time remaining</span>
              <strong>{session.frame.snapshot.timelimit > 0 ? `${formatInteractiveTickSeconds(gameplayTimeRemainingTicks(session))}s` : "Untimed"}</strong>
            </div>
            <div className="modern-result-sheet__row"><span>Undo used</span><strong>0</strong></div>
            <div className="modern-result-sheet__row"><span>Result</span><strong>{result.outcome === "failed" ? "Failed" : "Cleared clean"}</strong></div>
            <div className="modern-result-sheet__row"><span>Cause</span><strong>{result.outcome === "failed" ? result.cause?.message ?? "Unknown failure" : "Cleared"}</strong></div>
            <div className="modern-result-sheet__row"><span>Moves</span><strong>{session.recordedMoveCount ?? 0}</strong></div>
          </div>
        </section>

        <div className="modern-result-sheet__actions">
          <button className="modern-button modern-button--secondary" disabled type="button">Save Replay</button>
          <button className={result.outcome === "failed" ? "modern-button" : "modern-button modern-button--secondary"} onClick={onRetry} type="button">Retry (R)</button>
          <button className="modern-button modern-button--secondary" disabled type="button">Undo (Z)</button>
          {result.outcome !== "failed" ? <button className="modern-button" onClick={onNext} type="button">Next Level (N)</button> : null}
        </div>
      </section>
    </div>
  );
}

interface HybridCcV0HelpOverlayProps {
  onClose: () => void;
}

const HELP_SECTIONS = [
  {
    title: "Gameplay",
    commands: [
      { keys: "Arrow keys / WASD", action: "Move Chip and start the clock" },
      { keys: "Shift (hold)", action: "Run the game clock at double speed" },
      { keys: "Space", action: "Start the clock without moving" },
      { keys: "Backspace / Delete", action: "Pause or resume" },
      { keys: "R", action: "Restart the level" },
    ],
  },
  {
    title: "Navigation",
    commands: [
      { keys: "P / Page Up", action: "Previous level" },
      { keys: "N / Page Down", action: "Next level" },
      { keys: "Home / End", action: "First or last level" },
      { keys: "Enter / Space", action: "Continue after a win or retry after a loss" },
      { keys: "H / F1 / ?", action: "Open or close this help" },
    ],
  },
] as const;

export function HybridCcV0HelpOverlay({ onClose }: HybridCcV0HelpOverlayProps) {
  return (
    <div className="legacy-help-backdrop" onClick={onClose} role="presentation">
      <section aria-label="Keyboard help" className="legacy-help" onClick={(event) => event.stopPropagation()}>
        <div className="legacy-help__header">
          <h2 className="legacy-help__title">Controls</h2>
          <button className="legacy-help__close" onClick={onClose} type="button">Close</button>
        </div>
        <p className="legacy-help__note">Listed commands are the ones currently wired in Hybrid v0.</p>
        {HELP_SECTIONS.map((section) => (
          <section className="legacy-help__section" key={section.title}>
            <h3 className="legacy-help__section-title">{section.title}</h3>
            <div className="legacy-help__table">
              {section.commands.map((command) => (
                <div className="legacy-help__row" key={command.keys}>
                  <span className="legacy-help__keys">{command.keys}</span>
                  <span className="legacy-help__action">{command.action}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}
