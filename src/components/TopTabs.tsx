import { type CSSProperties } from "react";

export type TopTabItem<Key extends string = string> = {
  key: Key;
  label: string;
  disabled?: boolean;
};

type TopTabsProps<Key extends string = string> = {
  tabs: readonly TopTabItem<Key>[];
  activeKey: Key;
  onChange: (key: Key) => void;
  className?: string;
  ariaLabel?: string;
};

export function TopTabs<Key extends string = string>({
  tabs,
  activeKey,
  onChange,
  className,
  ariaLabel,
}: TopTabsProps<Key>) {
  if (tabs.length <= 0) {
    return null;
  }

  const rootClassName = className ? `top-tabs ${className}` : "top-tabs";
  const style = {
    "--top-tabs-count": Math.max(1, tabs.length),
  } as CSSProperties;

  return (
    <div className={rootClassName} style={style}>
      <div className="top-tabs-track" role="tablist" aria-label={ariaLabel ?? "分组切换"}>
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              className={`top-tabs-button ${active ? "active" : ""}`}
              role="tab"
              aria-selected={active}
              disabled={tab.disabled === true}
              onClick={() => onChange(tab.key)}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
