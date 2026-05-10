import { useCallback, type KeyboardEvent } from "react";
import optionsTitleIcon from "../assets/icons/options-title.svg";
import { useModalTransition } from "./useModalTransition";

type BestdoriLoginModalProps = {
  open: boolean;
  username: string;
  password: string;
  submitting: boolean;
  errorMessage: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function BestdoriLoginModal({
  open,
  username,
  password,
  submitting,
  errorMessage,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  onClose,
}: BestdoriLoginModalProps) {
  const { mounted, phase } = useModalTransition(open);

  const handleConfirm = useCallback(() => {
    if (submitting) {
      return;
    }
    onSubmit();
  }, [onSubmit, submitting]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleConfirm();
    }
  }, [handleConfirm]);

  if (!mounted) {
    return null;
  }

  const transitionClassName = phase === "enter" ? "is-enter" : "is-exit";

  return (
    <div
      className={`modal-mask modal-transition-mask ${transitionClassName}`}
      onClick={() => {
        if (!submitting) {
          onClose();
        }
      }}
    >
      <section
        className={`modal-card bestdori-login-modal modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header modal-titleline-header">
          <div className="modal-titleline-main">
            <img src={optionsTitleIcon} alt="" aria-hidden="true" className="modal-titleline-icon" />
            <div className="modal-titleline-content">
              <h3 className="modal-titleline-text">{"\u767B\u5F55"}</h3>
              <span className="modal-titleline-rule" />
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={submitting} title={"\u5173\u95ED"}>
            <span className="btn-content">{"\u00D7"}</span>
          </button>
        </header>

        <div className="modal-body">
          <div className="bestdori-login-form">
            <div className="setting-block">
              <span className="setting-title-strip">{"\u7528\u6237\u540D"}</span>
              <input
                type="text"
                className="value-input"
                value={username}
                onChange={(event) => onUsernameChange(event.currentTarget.value)}
                onKeyDown={handleKeyDown}
                autoComplete="username"
                disabled={submitting}
              />
            </div>

            <div className="setting-block">
              <span className="setting-title-strip">{"\u5BC6\u7801"}</span>
              <input
                type="password"
                className="value-input"
                value={password}
                onChange={(event) => onPasswordChange(event.currentTarget.value)}
                onKeyDown={handleKeyDown}
                autoComplete="current-password"
                disabled={submitting}
              />
            </div>
          </div>

          {errorMessage && <div className="bestdori-login-error">{errorMessage}</div>}

          <div className="modal-actions is-centered">
            <button
              type="button"
              className="app-settings-apply-button bestdori-login-submit"
              onClick={handleConfirm}
              disabled={submitting || username.trim().length === 0 || password.trim().length === 0}
            >
              <span className="btn-content">{submitting ? "\u767B\u5F55\u4E2D..." : "\u767B\u5F55"}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
