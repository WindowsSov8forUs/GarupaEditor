import { OriginalHeaderMenuButton } from "./OriginalMenuParts";
import { SongInformationBar } from "./SongInformation";
import type { ChartMetadata } from "../chartCore";
import { memo } from "react";
import { useOriginalUiScale } from "./OriginalAuthoredDialog";

type CommandBarProps = {
  metadata: ChartMetadata;
  onOpenSong: () => void;
  onOpenAppSettings: () => void;
  menuOpen?: boolean;
};
export const CommandBar = memo(function CommandBar({ metadata, onOpenSong, onOpenAppSettings, menuOpen = false }: CommandBarProps) {
  const scale = useOriginalUiScale();
  return <div className="command-bar" style={{ gap: 10 * scale, flexShrink: 0 }}>
    <SongInformationBar metadata={metadata} onOpen={onOpenSong} />
    <div className="command-group command-group-right" style={{ flexShrink: 0 }}>
      <OriginalHeaderMenuButton open={menuOpen} onClick={onOpenAppSettings} />
    </div>
  </div>;
});
CommandBar.displayName = "CommandBar";
