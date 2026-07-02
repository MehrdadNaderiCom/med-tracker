import { ImageResponse } from "next/og";
import { MedTrackIconArt } from "./app-icon-art";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<MedTrackIconArt dimension={size.width} />, {
    ...size,
  });
}
