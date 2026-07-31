"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ServicesTabs() {
  const pathname = usePathname();

  const tabs = [
    { name: "Overview", href: "/dashboard/services" },
    { name: "Body Modeling", href: "/dashboard/services/body-modeling" },
    { name: "Recommendations", href: "/dashboard/services/recommendations" },
  ];

  return (
    <div className="border-b border-gray-700/50 mt-6">
      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`
                whitespace-nowrap py-3 px-2 border-b-2 font-medium text-sm transition-colors
                ${
                  isActive
                    ? "border-blue-400 text-blue-400"
                    : "border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500"
                }
              `}
            >
              {tab.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
