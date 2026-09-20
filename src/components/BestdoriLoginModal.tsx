import { OriginalButton, OriginalDialogFrame, OriginalDialogHeader } from "./OriginalUi";
﻿import { useCallback, type KeyboardEvent } from "react";
import { useModalLayer } from "./useModalLayer";
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
  const { mounted, phase, transitionStyle, transitionRef } = useModalTransition(open);
  const modalLayerStyle = useModalLayer(open, mounted);

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
      ref={transitionRef} style={{ ...modalLayerStyle, ...transitionStyle }}
    >
      <OriginalDialogFrame
        className={`modal-card bestdori-login-modal modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <OriginalDialogHeader>{"\u767B\u5F55"}</OriginalDialogHeader>

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
            <OriginalButton tone="pink"
              type="button"
              className="app-settings-apply-button bestdori-login-submit"
              onClick={handleConfirm}
              disabled={submitting || username.trim().length === 0 || password.trim().length === 0}
            >
              <span className="btn-content">{submitting ? "\u767B\u5F55\u4E2D..." : "\u767B\u5F55"}</span>
            </OriginalButton>
            <OriginalButton tone="gray" type="button" className="app-settings-back-button" onClick={onClose} disabled={submitting}>
              <span className="btn-content">{"\u5173\u95ED"}</span>
            </OriginalButton>
          </div>
        </div>
      </OriginalDialogFrame>
    </div>
  );
}
