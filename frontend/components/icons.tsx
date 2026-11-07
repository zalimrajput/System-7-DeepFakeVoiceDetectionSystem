import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

export function IconUpload({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15" />
    </svg>
  );
}

export function IconAudioFile({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M14 3v4a2 2 0 0 0 2 2h4" />
      <path d="M19 11.5V7l-4-4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
      <path d="M9 12v3m3-5v7m3-4v2m4.5 1.5v3.5" />
    </svg>
  );
}

export function IconPlay({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPause({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <rect x="7" y="5.5" width="3.2" height="13" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.8" y="5.5" width="3.2" height="13" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconClose({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconWave({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M3 12h2m2-4v8m3-11v14m3-9v4m3-7v10m3-6v2m2-1h2" />
    </svg>
  );
}

export function IconShield({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconAlert({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M10.3 4.3 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4m0 3h.01" />
    </svg>
  );
}

export function IconReset({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M3 12a9 9 0 1 0 3.5-7.1" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

export function IconCpu({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M10 3v2m4-2v2m-4 14v2m4-2v2M3 10h2m-2 4h2m14-4h2m-2 4h2" />
    </svg>
  );
}

export function IconSpark({ className, ...props }: IconProps) {
  return (
    <svg {...base} className={className} {...props}>
      <path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8" />
    </svg>
  );
}
