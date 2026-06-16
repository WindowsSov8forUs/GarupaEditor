import { type CSSProperties, type ReactNode } from "react";
import optionsTitleIcon from "../assets/icons/options-title.svg";
import { useModalLayer } from "./useModalLayer";
import { useModalTransition, type ModalTransitionPhase } from "./useModalTransition";
import { useModalTransitionValue } from "./useModalTransitionValue";

type StandardModalBaseProps = {
  title: ReactNode;
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
  },
) {
  const {
    mounted,
    phase,
    layerStyle,
    title,
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
    <div className={`${maskClassName} modal-transition-mask ${transitionClassName}`} style={layerStyle}>
      <section
        className={`modal-card ${cardClassName} modal-transition-card ${transitionClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header modal-titleline-header">
          <div className="modal-titleline-main">
            <img src={optionsTitleIcon} alt="" aria-hidden="true" className="modal-titleline-icon" />
            <div className="modal-titleline-content">
              <h3 className="modal-titleline-text">{title}</h3>
              <span className="modal-titleline-rule" />
            </div>
          </div>
        </header>

        <div className={`modal-body ${bodyClassName}`}>
          {children}
          {showFooter && (
            <div className={`modal-actions is-centered ${footerClassName}`}>
              {actions}
              {onClose && !hideCloseAction && (
                <button type="button" className="app-settings-back-button" onClick={onClose} disabled={closeDisabled}>
                  <span className="btn-content">{closeLabel}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function StandardModal({
  open,
  ...props
}: StandardModalProps) {
  const { mounted, phase } = useModalTransition(open);
  const layerStyle = useModalLayer(open, mounted);

  return renderStandardModalFrame({
    ...props,
    mounted,
    phase,
    layerStyle,
  });
}

export function StandardValueModal<T>({
  value,
  title,
  children,
  ...props
}: StandardValueModalProps<T>) {
  const { mounted, phase, renderedValue } = useModalTransitionValue(value);
  const layerStyle = useModalLayer(value !== null, mounted);

  if (!mounted || renderedValue === null) {
    return null;
  }

  return renderStandardModalFrame({
    ...props,
    mounted,
    phase,
    layerStyle,
    title: typeof title === "function" ? title(renderedValue) : title,
    children: children(renderedValue),
  });
}
