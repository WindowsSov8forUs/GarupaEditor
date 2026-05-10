type SettingPrimaryTitleProps = {
  text: string;
  className?: string;
};

export function SettingPrimaryTitle({ text, className }: SettingPrimaryTitleProps) {
  const rootClassName = className
    ? `setting-title-primary ${className}`
    : "setting-title-primary";
  return (
    <div className={rootClassName} role="heading" aria-level={2}>
      <span className="setting-title-primary-label">
        <span className="setting-title-primary-star" aria-hidden="true">
          <svg
            className="setting-title-primary-star-icon"
            viewBox="0 0 24 24"
            focusable="false"
            aria-hidden="true"
          >
            <path
              className="setting-title-primary-star-core"
              d="M12 1.3 16.28 7.12 22.55 8.9 18.72 14.36 19.02 22.24 12 18.92 4.98 22.24 5.28 14.36 1.45 8.9 7.72 7.12 12 1.3z"
            />
            <path
              className="setting-title-primary-star-outline"
              d="M12 1.3 16.28 7.12 22.55 8.9 18.72 14.36 19.02 22.24 12 18.92 4.98 22.24 5.28 14.36 1.45 8.9 7.72 7.12 12 1.3z"
            />
          </svg>
        </span>
        <span className="setting-title-primary-text-stack">
          <span className="setting-title-primary-text setting-title-primary-text-stroke" aria-hidden="true">
            {text}
          </span>
          <span className="setting-title-primary-text setting-title-primary-text-fill">{text}</span>
        </span>
      </span>
    </div>
  );
}
