import { Sparkles } from "lucide-react";

export type TobiBrandIconVariant = "sparkles" | "vodafone" | "ai-modern";

function TobiMascot({ faceColor = "#F1EFF2" }: { faceColor?: string }) {
  return (
    <>
      <path d="M8 47C8 22 26.8 5 50 5s42 17 42 42v17c0 9.4-6.4 16.1-15.8 16.8V48H23.8v32.8C14.4 80.1 8 73.4 8 64V47Z" fill="#E60000" />
      <path d="M18.5 48c7.6 7 17.8 10 31.5 10s23.9-3 31.5-10v21.5C81.5 86 68.2 96 50 96S18.5 86 18.5 69.5V48Z" fill={faceColor} />
      <circle cx="37.5" cy="65" r="5.8" fill="#555" />
      <circle cx="62.5" cy="65" r="5.8" fill="#555" />
      <path d="M33 79c4.7 5.4 10.4 8 17 8s12.3-2.6 17-8" stroke="#555" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M52.7 10.5c-12 0-20.5 8.3-20.5 19.2 0 10.1 7.3 17.4 17.2 17.4 10.4 0 17.6-7.1 17.6-16.5 0-7.4-4.9-13-12.3-14.4 2.7-2.8 6-4.7 10.2-5.7-3.8-.2-7.9-.2-12.2 0Z" fill="white" />
    </>
  );
}

function TobiAiMascot() {
  return (
    <>
      <path
        d="M8 58C8 31.7 29 12 58 12c26 0 44 19.5 44 43v21c0 9.3-5.7 15.3-14.5 16.3V58.5C79 64.3 68.7 67 58 67s-21.3-2.7-30.5-8.5v33.8C15.7 91 8 84.9 8 76V58Z"
        fill="#E60000"
      />
      <path d="M8 75.5c.2 9.1 6.4 15.2 16 16.7V84c-7.4-.6-12.8-3.4-16-8.5Z" fill="#BD0000" />
      <path d="M102 75.5c-.2 9.1-5.5 15.2-14.5 16.7V84c6.7-.6 11.5-3.4 14.5-8.5Z" fill="#BD0000" />

      <path
        d="M22.5 54.5c3 0 6.8 4.4 14.6 7 11 3.7 29 3.7 40.6 0 7.4-2.4 10.2-7 13.2-7 3.3 0 5.1 2.6 5.1 6.5v19c0 17.5-16.5 29-38 29S20 97.5 20 80V61c0-3.9 1.1-6.5 2.5-6.5Z"
        fill="#E5E5E5"
      />
      <circle cx="39" cy="72" r="5.8" fill="#555555" />
      <circle cx="69" cy="72" r="5.8" fill="#555555" />
      <path d="M34 88c5.5 5.5 12.7 8.2 21.5 8.2S71.5 93.5 77 88" stroke="#555555" strokeWidth="4.3" strokeLinecap="round" />

      <path
        d="M61.5 17.5C48 14.8 36 23.4 36 36.5 36 47.7 44.6 56 55.5 56 66.6 56 75 47.7 75 36.8c0-7.8-4.5-14.6-11.9-17.9 2.4 3.8 3.7 8.5 3.7 13.5 0 10.7-5 15.9-11.3 15.9-6.4 0-11.3-4.9-11.3-11.4 0-6.4 4.3-11.1 10.5-11.3 2.4-.1 4.6-1.1 6.8-8.1Z"
        fill="white"
      />

      <path
        d="m103 14 3.8 8.2L115 26l-8.2 3.8L103 38l-3.8-8.2L91 26l8.2-3.8L103 14Z"
        fill="white"
        stroke="#E60000"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="m91.5 6.5 2.2 4.8 4.8 2.2-4.8 2.2-2.2 4.8-2.2-4.8-4.8-2.2 4.8-2.2 2.2-4.8Z"
        fill="white"
        stroke="#E60000"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="m87.5 28.5 2.2 4.8 4.8 2.2-4.8 2.2-2.2 4.8-2.2-4.8-4.8-2.2 4.8-2.2 2.2-4.8Z" fill="white" />
    </>
  );
}

export function TobiBrandIcon({ variant, size = 20 }: { variant: TobiBrandIconVariant; size?: number }) {
  if (variant === "sparkles") return <Sparkles size={size} fill="currentColor" aria-hidden="true" />;

  if (variant === "ai-modern") {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true" focusable="false">
        <TobiAiMascot />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true" focusable="false">
      <TobiMascot />
    </svg>
  );
}
