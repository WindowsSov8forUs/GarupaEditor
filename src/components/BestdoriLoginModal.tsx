import { useEffect, useState, type KeyboardEvent } from "react";
import { OriginalTransferDialog } from "./OriginalTransferDialog";
import { OriginalAuthoredDialog } from "./OriginalAuthoredDialog";
import { OriginalPrefabModel, ORIGINAL_PREFABS } from "./originalPrefabModel";
import { OriginalCaptionField, OriginalFormButton, OriginalFormNote, ORIGINAL_CAPTION_FIELD_WIDTH,
  TRANSFER_PAGE_PADDING_X } from "./OriginalFormParts";

type BestdoriLoginModalProps = {
  open: boolean; username: string; password: string; submitting: boolean; errorMessage: string;
  accountUsername: string; accountNickname: string;
  onUsernameChange: (value: string) => void; onPasswordChange: (value: string) => void;
  onSubmit: () => void; onLogout: () => void; onClose: () => void;
};
const logoutModel = new OriginalPrefabModel(ORIGINAL_PREFABS.selectablecommondialog!, { components: {
  33: { mText: "退出 Bestdori 账号" },
  35: { mText: "确定退出当前 Bestdori 账号？", mEncoding: false },
  38: { mText: "取消" }, 42: { mText: "退出登录" },
} });

export function BestdoriLoginModal(props: BestdoriLoginModalProps) {
  const [switching, setSwitching] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  useEffect(() => { if (props.open) { setSwitching(false); setConfirmLogout(false); } }, [props.open]);
  const form = !props.accountUsername || switching;
  const close = () => { if (!props.submitting) props.onClose(); };
  const submit = () => { if (!props.submitting) props.onSubmit(); };
  const keyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); }
  };
  return <>
    <OriginalTransferDialog open={props.open} title="Bestdori 账号" fitContent onClose={close} busy={props.submitting}>
      <div className="transfer-body">
        {/* The window fits its button row, as the original dialogs do; the form fills that width. */}
        <div className="transfer-page transfer-page-follows-actions">
          {/* Laid out as the JP データ引き継ぎ window: an ID and a password, captions centred over their boxes. */}
          <OriginalCaptionField caption="用户名" aria-label="Bestdori 用户名" value={form ? props.username : props.accountUsername}
            readOnly={!form} disabled={props.submitting} autoComplete="username"
            onChange={event => props.onUsernameChange(event.currentTarget.value)} onKeyDown={keyDown} />
          {form ? <>
            <OriginalCaptionField caption="密码" aria-label="Bestdori 密码" type="password" value={props.password}
              disabled={props.submitting} autoComplete="current-password"
              onChange={event => props.onPasswordChange(event.currentTarget.value)} onKeyDown={keyDown} />
          </> : <>
            <OriginalCaptionField caption="昵称" aria-label="Bestdori 昵称" value={props.accountNickname} readOnly />
          </>}
          {props.errorMessage && <div role="alert"><OriginalFormNote text={props.errorMessage} /></div>}
        </div>
        {/* At least as wide as the fields' caption bars, whichever buttons the row has. */}
        <div className="transfer-actions" style={{ minWidth: ORIGINAL_CAPTION_FIELD_WIDTH + 2 * TRANSFER_PAGE_PADDING_X }}>
          {form ? <OriginalFormButton tone="pink" disabled={props.submitting || !props.username.trim() || !props.password}
            onClick={submit}>{props.submitting ? "登录中…" : "登录"}</OriginalFormButton> : <>
            <OriginalFormButton tone="pink" disabled={props.submitting} onClick={() => {
              props.onPasswordChange(""); setSwitching(true);
            }}>切换账号</OriginalFormButton>
            <OriginalFormButton disabled={props.submitting} onClick={() => setConfirmLogout(true)}>退出登录</OriginalFormButton>
          </>}
          <OriginalFormButton disabled={props.submitting} onClick={close}>关闭</OriginalFormButton>
        </div>
      </div>
    </OriginalTransferDialog>
    <OriginalAuthoredDialog open={props.open && confirmLogout} model={logoutModel} busy={props.submitting}
      onClose={() => { if (!props.submitting) setConfirmLogout(false); }}
      bindings={{ buttons: {
        39: { label: "取消", action: () => setConfirmLogout(false), disabled: props.submitting },
        45: { label: "退出登录", action: () => { setConfirmLogout(false); props.onLogout(); }, disabled: props.submitting },
      } }} />
  </>;
}
