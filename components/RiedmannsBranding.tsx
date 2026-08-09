"use client";

import Image from "next/image";
import { appInfo, getFooterLines } from "@/lib/app-info";

type RiedmannsBrandingProps = {
  variant?: "client" | "admin";
  className?: string;
};

const RIEDMANN_APPS_URL = "https://riedmannapps.com";

export function RiedmannsBranding({
  variant = "client",
  className = ""
}: RiedmannsBrandingProps) {
  const [footerTitle, footerDeveloper, footerCopyright] = getFooterLines();

  return (
    <div
      className={`flex w-full flex-col items-center justify-between gap-3 border-t border-[#ddd0c1] py-6 text-center text-xs text-[#6b6258] sm:flex-row sm:text-left ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
        <span className="relative h-5 w-5 overflow-hidden rounded-md">
          <Image
            src="/brand/ra-logo-original.png"
            alt="Riedmann Apps"
            fill
            className="object-cover"
          />
        </span>
        <span>{footerTitle}</span>
        <a
          href={RIEDMANN_APPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[#4d3020] underline-offset-4 hover:text-[#956a3f] hover:underline"
        >
          {footerDeveloper}
        </a>
      </div>
      <span>
        {footerCopyright}
        {variant === "admin" ? ` · v${appInfo.version}` : ""}
      </span>
    </div>
  );
}
