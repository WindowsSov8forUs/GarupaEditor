import { memo } from "react";
import importJsonIcon from "../assets/icons/json-import.svg";
import exportJsonIcon from "../assets/icons/json-export.svg";
import skinIcon from "../assets/icons/skin.svg";
import previewIcon from "../assets/icons/preview.svg";

type CommandBarProps = {
  onImportJson: () => void;
  onExportJson: () => void;
  onOpenStaticRender: () => void;
  onOpenSkinSettings: () => void;
  onOpenAppSettings: () => void;
};

export const CommandBar = memo(function CommandBar({
  onImportJson,
  onExportJson,
  onOpenStaticRender,
  onOpenSkinSettings,
  onOpenAppSettings,
}: CommandBarProps) {
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
      </div>
      <div className="command-group command-group-right">
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
