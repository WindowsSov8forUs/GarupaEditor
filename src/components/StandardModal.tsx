import { OriginalButton, OriginalDialogFrame, OriginalDialogHeader } from "./OriginalUi";
import { type CSSProperties, type ReactNode, type RefObject } from "react";
import { type OriginalAtlas } from "./useOriginalSurface";
import { useOriginalDialogInput } from "./useOriginalDialogInput";
import { useModalLayer } from "./useModalLayer";
import { useModalTransition, type ModalTransitionPhase, type DialogMotion } from "./useModalTransition";
import { useModalTransitionValue } from "./useModalTransitionValue";

type StandardModalBaseProps = {
  title: ReactNode;
  motion?: DialogMotion;
  atlas?: OriginalAtlas;
  maskClassName?: string;
  cardClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  actions?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  closeDisabled?: boolean;
  hideCloseAction?: boolean;
  children: ReactNode;
};

type StandardModalProps = StandardModalBaseProps & {
  open: boolean;
};

type StandardValueModalProps<T> = Omit<StandardModalBaseProps, "children" | "title"> & {
  value: T | null;
  title: ReactNode | ((value: T) => ReactNode);
  children: (value: T) => ReactNode;
};

// StandardModal is the shared implementation for ordinary modal dialogs.
// Do not use it for mobile route overlays or download/progress indicators.
function renderStandardModalFrame(
  props: StandardModalBaseProps & {
    mounted: boolean;
    phase: ModalTransitionPhase;
    layerStyle: CSSProperties;
    transitionRef: RefObject<HTMLDivElement | null>;
  },
) {
  const {
    mounted,
    phase,
    layerStyle,
    transitionRef,
    title,
    motion = "scale",
    atlas = "common",
    maskClassName = "modal-mask",
    cardClassName = "",
    bodyClassName = "",
    footerClassName = "",
    actions,
    onClose,
    closeLabel = "关闭",
    closeDisabled = false,
    hideCloseAction = false,
    children,
  } = props;

  if (!mounted) {
    return null;
  }

  const transitionClassName = phase === "enter" ? "is-enter" : "is-exit";
  const showFooter = Boolean(actions) || (Boolean(onClose) && !hideCloseAction);

  return (
    <div className={`${maskClassName} modal-transition-mask ${transitionClassName}`} ref={transitionRef} style={layerStyle} tabIndex={-1}>
      <OriginalDialogFrame atlas={atlas} role="dialog" aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined} data-motion={motion}
        inert={phase === "exit" || layerStyle.pointerEvents === "none"}
        className={`modal-card ${cardClassName} modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <OriginalDialogHeader atlas={atlas}>{title}</OriginalDialogHeader>

        <div className={`modal-body ${bodyClassName}`}>
          {children}
          {showFooter && (
            <div className={`modal-actions is-centered ${footerClassName}`}>
              {actions}
              {onClose && !hideCloseAction && (
                <OriginalButton tone="gray" type="button" className="app-settings-back-button" onClick={onClose} disabled={closeDisabled}>
                  <span className="btn-content">{closeLabel}</span>
                </OriginalButton>
              )}
            </div>
          )}
        </div>
      </OriginalDialogFrame>
    </div>
  );
}

export function StandardModal({
  open,
  ...props
}: StandardModalProps) {
  const { mounted, phase, transitionStyle, transitionRef } = useModalTransition(open, props.motion);
  const layerStyle = useModalLayer(open, mounted);
  useOriginalDialogInput(transitionRef, mounted, props.onClose, !open || !!props.closeDisabled);

  return renderStandardModalFrame({
    ...props,
    mounted,
    phase,
    layerStyle: { ...layerStyle, ...transitionStyle },
    transitionRef,
  });
}

export function StandardValueModal<T>({
  value,
  title,
  children,
  ...props
}: StandardValueModalProps<T>) {
  const { mounted, phase, renderedValue, transitionStyle, transitionRef } = useModalTransitionValue(value, props.motion);
  const layerStyle = useModalLayer(value !== null, mounted);
  useOriginalDialogInput(transitionRef, mounted, props.onClose, value === null || !!props.closeDisabled);

  if (!mounted || renderedValue === null) {
    return null;
  }

  return renderStandardModalFrame({
    ...props,
    mounted,
    phase,
    layerStyle: { ...layerStyle, ...transitionStyle },
    transitionRef,
    title: typeof title === "function" ? title(renderedValue) : title,
    children: children(renderedValue),
  });
}
