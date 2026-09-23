import { OriginalHeaderMenuButton } from "./OriginalMenuParts";
import { memo } from "react";
import { useApplicationResourceUrl } from "../resources/applicationResourceContext";

type CommandBarProps = {
  onOpenStaticRender: () => void;
  onOpenSimulator: () => void;
  onOpenAppSettings: () => void;
  menuOpen?: boolean;
};

export const CommandBar = memo(function CommandBar({
  onOpenStaticRender,
  onOpenSimulator,
  onOpenAppSettings,
  menuOpen = false,
}: CommandBarProps) {
  const previewIcon = useApplicationResourceUrl("ui.icon.preview");
  const simulatorIcon = useApplicationResourceUrl("ui.icon.display");
  return (
    <div className="command-bar">
      <div className="command-group">
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
        <OriginalHeaderMenuButton open={menuOpen} onClick={onOpenAppSettings} />
      </div>
    </div>
  );
});

CommandBar.displayName = "CommandBar";
