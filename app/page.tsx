import { Suspense } from "react";
import MedTrackLoader from "./med-track-loader";
import { MedTrackLoading } from "./med-track-loading";

export default function Home() {
  return (
    <Suspense fallback={<MedTrackLoading />}>
      <MedTrackLoader />
    </Suspense>
  );
}
