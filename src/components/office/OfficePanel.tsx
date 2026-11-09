"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { OfficePersonDTO } from "@/lib/office/roster";

// Loaded only on a desktop-width screen, so phones fetch neither the code nor the art.
const OfficeScene = dynamic(() => import("./OfficeScene"), { ssr: false });

export function OfficePanel({ people }: { people: OfficePersonDTO[] }) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return <div className="hidden w-full lg:block">{wide && <OfficeScene people={people} />}</div>;
}
