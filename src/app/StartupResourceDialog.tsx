import { StandardModal } from "../components/StandardModal";
import { OriginalButton } from "../components/OriginalUi";
import { BuiltinResourcePresentationProvider } from "../resources/applicationResourceContext";
import { listApplicationBuiltinImages } from "../resources/builtin/builtinResourceCatalog";

const urls = new Map(listApplicationBuiltinImages().map(entry => [entry.slot, entry.url]));

/** Use the shared original dialog, with packaged artwork even if storage bootstrap failed. */
export default function StartupResourceDialog({ error, warnings, onRetry, onContinue, title }: {
  error: string; warnings: readonly string[]; onRetry(): void; onContinue?: () => void; title?: string;
}) {
  return <BuiltinResourcePresentationProvider urls={urls}>
    <div style={{ position: "fixed", inset: 0, zIndex: 10002 }}>
      <StandardModal open title={title ?? (error ? "启动加载失败" : "部分资源未准备完成")} hideCloseAction
        actions={<>
          <OriginalButton tone="pink" onClick={onRetry}>重试</OriginalButton>
          {!error && onContinue && <OriginalButton tone="gray" onClick={onContinue}>继续</OriginalButton>}
        </>}>
        <div style={{ maxHeight: "min(320px, 40vh)", overflowY: "auto", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
          {error || warnings.join("\n\n")}
        </div>
        {!error && <p>未完成的资源将在下次启动时重试；继续进入后，仍需等待当前页面所需资源准备完成。</p>}
      </StandardModal>
    </div>
  </BuiltinResourcePresentationProvider>;
}
