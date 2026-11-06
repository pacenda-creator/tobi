import { Sparkles } from "lucide-react";

export type TobiBrandIconVariant = "sparkles" | "vodafone" | "ai-modern";

export function TobiBrandIcon({ variant, size = 20 }: { variant: TobiBrandIconVariant; size?: number }) {
  if (variant === "sparkles") return <Sparkles size={size} fill="currentColor" aria-hidden="true" />;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true">
      <path d="M8 47C8 22 26.8 5 50 5s42 17 42 42v17c0 9.4-6.4 16.1-15.8 16.8V48H23.8v32.8C14.4 80.1 8 73.4 8 64V47Z" fill="#E60000" />
      <path d="M18.5 48c7.6 7 17.8 10 31.5 10s23.9-3 31.5-10v21.5C81.5 86 68.2 96 50 96S18.5 86 18.5 69.5V48Z" fill="#F1EFF2" />
      <circle cx="37.5" cy="65" r="5.8" fill="#555" />
      <circle cx="62.5" cy="65" r="5.8" fill="#555" />
      <path d="M33 79c4.7 5.4 10.4 8 17 8s12.3-2.6 17-8" stroke="#555" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M52.7 10.5c-12 0-20.5 8.3-20.5 19.2 0 10.1 7.3 17.4 17.2 17.4 10.4 0 17.6-7.1 17.6-16.5 0-7.4-4.9-13-12.3-14.4 2.7-2.8 6-4.7 10.2-5.7-3.8-.2-7.9-.2-12.2 0Z" fill="white" />
      {variant === "ai-modern" ? <>
        <path d="M84 7c1.2 7 5 10.8 12 12-7 1.2-10.8 5-12 12-1.2-7-5-10.8-12-12 7-1.2 10.8-5 12-12Z" fill="#7357FF" stroke="white" strokeWidth="2" />
        <path d="M16 76c.8 4.8 3.4 7.4 8.2 8.2-4.8.8-7.4 3.4-8.2 8.2-.8-4.8-3.4-7.4-8.2-8.2 4.8-.8 7.4-3.4 8.2-8.2Z" fill="#32A7FF" stroke="white" strokeWidth="2" />
      </> : null}
    </svg>
  );
}
