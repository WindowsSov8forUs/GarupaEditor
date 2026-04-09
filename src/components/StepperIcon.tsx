import { memo } from "react";

type StepperIconProps = {
  type: "plus" | "minus" | "left" | "right";
};

export const StepperIcon = memo(function StepperIcon({ type }: StepperIconProps) {
  const symbolPath = (() => {
    switch (type) {
      case "plus":
        return "M9 2H15V9H22V15H15V22H9V15H2V9H9Z";
      case "left":
        return "M16 2L5 12L16 22L20 18L13 12L20 6Z";
      case "right":
        return "M8 2L19 12L8 22L4 18L11 12L4 6Z";
      case "minus":
      default:
        return "M2 9H22V15H2Z";
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
        <path d={symbolPath} className="stepper-icon-shape" stroke="#ffffff" strokeWidth="1" />
      </g>
    </svg>
  );
});

StepperIcon.displayName = "StepperIcon";
