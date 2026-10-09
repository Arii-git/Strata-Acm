import { forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={`${buttonClass(variant, size)}${className ? ` ${className}` : ""}`} {...rest}>
      {icon}
      {children}
    </button>
  );
});

/** Class string for styling a <Link> as a button: <Link className={buttonClass("primary")} ...> */
export function buttonClass(variant: ButtonVariant = "secondary", size: "md" | "sm" = "md"): string {
  return ["btn", `btn--${variant}`, size === "sm" ? "btn--sm" : ""].filter(Boolean).join(" ");
}
