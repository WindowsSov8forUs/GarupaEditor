import { useCallback, useEffect, useRef, useState } from "react";
import { bestdoriCheckSession, bestdoriLogin, bestdoriLogout, onBestdoriSessionExpired } from "../services/bestdori/api";
import { appLog } from "../logging/applicationLogger";
import type { BestdoriLoginModal } from "../components/BestdoriLoginModal";

type ModalProps = Parameters<typeof BestdoriLoginModal>[0];

/**
 * The Bestdori account as the login window (BestdoriLoginModal) shows and changes it: the signed-in account, checked
 * with Bestdori when this mounts, and the window's form. `report` shows a failed login or logout; `onExpired` is told
 * when Bestdori no longer accepts the stored login (the account is then shown signed out).
 */
export function useBestdoriAccount({ report, onExpired }: {
  report(message: string): void;
  onExpired?(): void;
}) {
  const authRevision = useRef(0);
  const authBusy = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const reportRef = useRef(report);
  reportRef.current = report;
  const expiredRef = useRef(onExpired);
  expiredRef.current = onExpired;

  // A login Bestdori no longer accepts, found at startup or before an upload, is shown signed out.
  useEffect(() => onBestdoriSessionExpired(() => {
    authRevision.current += 1;
    setUsername("");
    setNickname("");
    expiredRef.current?.();
  }), []);
  useEffect(() => {
    let disposed = false;
    const revision = authRevision.current;
    void (async () => {
      try {
        const session = await bestdoriCheckSession();
        if (disposed || revision !== authRevision.current) return;
        // Offline, the stored account stays shown; it is checked again before it is used.
        const me = session.status === "signed-in" ? session.me : session.status === "unverified" ? session.me : null;
        if (!me) return;
        setUsername(me.username?.trim() ?? "");
        setNickname(me.nickname?.trim() ?? "");
      } catch (error) {
        appLog("warn", "auth.session-check-failed", { error });
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  const open = useCallback(() => {
    setErrorMessage("");
    setPasswordInput("");
    setUsernameInput(current => current || username);
    setIsOpen(true);
  }, [username]);

  const close = useCallback(() => {
    if (authBusy.current) return;
    setIsOpen(false);
    setPasswordInput("");
  }, []);

  const submit = useCallback(async () => {
    if (authBusy.current) return;
    const name = usernameInput.trim();
    const password = passwordInput.trim();
    if (!name || !password) {
      setErrorMessage("请输入用户名和密码。");
      return;
    }
    authBusy.current = true;
    authRevision.current += 1;
    setSubmitting(true);
    setErrorMessage("");
    try {
      const response = await bestdoriLogin(name, password);
      setUsername(typeof response.username === "string" ? response.username.trim() : name);
      setNickname(typeof response.nickname === "string" ? response.nickname.trim() : "");
      setIsOpen(false);
      setPasswordInput("");
    } catch (error) {
      reportRef.current(`Bestdori 登录失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      authBusy.current = false;
      setSubmitting(false);
    }
  }, [passwordInput, usernameInput]);

  const logout = useCallback(async () => {
    if (authBusy.current) return;
    authBusy.current = true;
    authRevision.current += 1;
    setSubmitting(true);
    setErrorMessage("");
    try {
      await bestdoriLogout();
      setUsername("");
      setNickname("");
      setPasswordInput("");
    } catch (error) {
      reportRef.current(`Bestdori 退出登录失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      authBusy.current = false;
      setSubmitting(false);
    }
  }, []);

  const modalProps: ModalProps = {
    open: isOpen, accountUsername: username, accountNickname: nickname,
    username: usernameInput, password: passwordInput, submitting, errorMessage,
    onUsernameChange: setUsernameInput, onPasswordChange: setPasswordInput,
    onSubmit: () => void submit(), onLogout: () => void logout(), onClose: close,
  };
  return { username, nickname, open, modalProps };
}
