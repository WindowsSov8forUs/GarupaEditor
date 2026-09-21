import { OriginalHeaderMenuButton } from "./OriginalMenuParts";
import { memo, type KeyboardEvent } from "react";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";

type CommandBarProps = {
  onOpenStaticRender: () => void;
  onOpenSimulator: () => void;
  onOpenSkinSettings: () => void;
  onOpenAppSettings: () => void;
  menuOpen?: boolean;
  userNickname?: string | null;
  userUsername?: string | null;
  onUserBarClick?: () => void;
};

export const CommandBar = memo(function CommandBar({
  onOpenStaticRender,
  onOpenSimulator,
  onOpenSkinSettings,
  onOpenAppSettings,
  menuOpen = false,
  userNickname,
  userUsername,
  onUserBarClick,
}: CommandBarProps) {
  const skinIcon = useApplicationResourceUrl("ui.icon.skin");
  const previewIcon = useApplicationResourceUrl("ui.icon.preview");
  const simulatorIcon = useApplicationResourceUrl("ui.icon.display");
  const nickname = typeof userNickname === "string" ? userNickname.trim() : "";
  const username = typeof userUsername === "string" ? userUsername.trim() : "";
  const hasNickname = nickname.length > 0;
  const hasUsername = username.length > 0;
  const nicknameText = hasNickname ? nickname : hasUsername ? username : "未登录";
  const usernameText = hasNickname && hasUsername ? `@${username}` : "";

  const handleUserBarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onUserBarClick) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onUserBarClick();
    }
  };

  return (
    <div className="command-bar">
      <div className="command-group">
        <button
          type="button"
          className="command-icon-button"
          onClick={onOpenSkinSettings}
          title="皮肤"
          aria-label="皮肤"
        >
          <img className="command-text-icon" src={skinIcon} alt="" aria-hidden="true" />
          <span className="sr-only">皮肤</span>
        </button>
        <button
          type="button"
          className="command-icon-button"
          onClick={onOpenStaticRender}
          title="预览"
          aria-label="预览"
        >
          <img className="command-text-icon" src={previewIcon} alt="" aria-hidden="true" />
          <span className="sr-only">预览</span>
        </button>
        <button
          type="button"
          className="command-icon-button"
          onClick={onOpenSimulator}
          title="播放器"
          aria-label="播放器"
        >
          <img className="command-text-icon" src={simulatorIcon} alt="" aria-hidden="true" />
          <span className="sr-only">播放器</span>
        </button>
      </div>
      <div className="command-group command-group-right">
        <div
          className={`command-user-bar ${onUserBarClick ? "is-clickable" : ""}`}
          role={onUserBarClick ? "button" : undefined}
          tabIndex={onUserBarClick ? 0 : undefined}
          onClick={onUserBarClick}
          onKeyDown={handleUserBarKeyDown}
          title={onUserBarClick ? "登录" : undefined}
        >
          <div className="command-user-row command-user-row-nickname">{nicknameText}</div>
          <div className="command-user-row command-user-row-username">{usernameText}</div>
        </div>
        <OriginalHeaderMenuButton open={menuOpen} onClick={onOpenAppSettings} />
      </div>
    </div>
  );
});

CommandBar.displayName = "CommandBar";
