import { memo } from "react";

type StepperIconProps = {
  type: "plus" | "minus" | "left" | "right" | "leftDouble" | "rightDouble" | "close";
};

export const StepperIcon = memo(function StepperIcon({ type }: StepperIconProps) {
  const iconSpec = (() => {
    switch (type) {
      case "plus":
        return { path: "M9 2H15V9H22V15H15V22H9V15H2V9H9Z", rotate: false };
      case "close":
        return { path: "M9 2H15V9H22V15H15V22H9V15H2V9H9Z", rotate: true };
      case "left":
        return { path: "M16 2L5 12L16 22L20 18L13 12L20 6Z", rotate: false };
      case "leftDouble":
        return { path: "M20 2L11 12L20 22L23 19L17 12L23 5ZM11 2L2 12L11 22L14 19L8 12L14 5Z", rotate: false };
      case "right":
        return { path: "M8 2L19 12L8 22L4 18L11 12L4 6Z", rotate: false };
      case "rightDouble":
        return { path: "M4 2L13 12L4 22L1 19L7 12L1 5ZM13 2L22 12L13 22L10 19L16 12L10 5Z", rotate: false };
      case "minus":
      default:
        return { path: "M2 9H22V15H2Z", rotate: false };
    }
  })();

  return (
    <svg
      className="stepper-icon-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(12 12) scale(1.25) translate(-12 -12)">
        <path
          d={iconSpec.path}
          transform={iconSpec.rotate ? "rotate(45 12 12)" : undefined}
          className="stepper-icon-shape"
          stroke="#ffffff"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
});

StepperIcon.displayName = "StepperIcon";
