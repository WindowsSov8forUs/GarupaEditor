import { memo, type KeyboardEvent } from "react";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";

type CommandBarProps = {
  onImportJson: () => void;
  onExportJson: () => void;
  onOpenStaticRender: () => void;
  onOpenSimulator: () => void;
  onOpenSkinSettings: () => void;
  onOpenAppSettings: () => void;
  userNickname?: string | null;
  userUsername?: string | null;
  onUserBarClick?: () => void;
};

export const CommandBar = memo(function CommandBar({
  onImportJson,
  onExportJson,
  onOpenStaticRender,
  onOpenSimulator,
  onOpenSkinSettings,
  onOpenAppSettings,
  userNickname,
  userUsername,
  onUserBarClick,
}: CommandBarProps) {
  const importJsonIcon = useApplicationResourceUrl("ui.icon.json-import");
  const exportJsonIcon = useApplicationResourceUrl("ui.icon.json-export");
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
        <button type="button" className="command-icon-button" onClick={onImportJson} title="导入" aria-label="导入">
          <img className="command-text-icon" src={importJsonIcon} alt="" aria-hidden="true" />
          <span className="sr-only">导入</span>
        </button>
        <button type="button" className="command-icon-button" onClick={onExportJson} title="导出" aria-label="导出">
          <img className="command-text-icon" src={exportJsonIcon} alt="" aria-hidden="true" />
          <span className="sr-only">导出</span>
        </button>
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
        <button type="button" className="command-icon-button" onClick={onOpenAppSettings} title="目录">
          <span className="sr-only">目录</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="3" width="18" height="4.2" rx="1.8" />
            <rect x="3" y="9.9" width="18" height="4.2" rx="1.8" />
            <rect x="3" y="16.8" width="18" height="4.2" rx="1.8" />
          </svg>
        </button>
      </div>
    </div>
  );
});

CommandBar.displayName = "CommandBar";
