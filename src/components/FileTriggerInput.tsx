type FileTriggerInputProps = {
  value: string;
  placeholder?: string;
  onTrigger: () => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

export function FileTriggerInput({
  value,
  placeholder = "选择谱面文件",
  onTrigger,
  className,
  disabled = false,
  ariaLabel,
}: FileTriggerInputProps) {
  const hasValue = value.trim().length > 0;
  const displayValue = hasValue ? value.replace(/\\/g, "/") : placeholder;
  const rootClassName = className ? `value-input file-trigger-input ${className}` : "value-input file-trigger-input";

  return (
    <input
      type="text"
      className={rootClassName}
      value={displayValue}
      data-placeholder-active={hasValue ? "false" : "true"}
      readOnly
      spellCheck={false}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={() => {
        if (!disabled) {
          onTrigger();
        }
      }}
      onKeyDown={(event) => {
        if (disabled) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onTrigger();
        }
      }}
    />
  );
}
