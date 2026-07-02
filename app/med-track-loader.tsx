"use client";

import dynamic from "next/dynamic";
import { MedTrackLoading } from "./med-track-loading";

const MedTrackApp = dynamic(() => import("./med-track-app"), {
  ssr: false,
  loading: () => <MedTrackLoading />,
});

export default function MedTrackLoader() {
  return <MedTrackApp />;
}
