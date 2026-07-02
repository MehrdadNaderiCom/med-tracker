export function MedTrackIconArt({ dimension }: { dimension: number }) {
  const scale = dimension / 512;
  const px = (value: number) => Math.round(value * scale);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        background:
          "linear-gradient(145deg, #047857 0%, #059669 48%, #14b8a6 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: px(34),
          right: px(34),
          bottom: px(34),
          left: px(34),
          border: `${px(4)}px solid rgba(255, 255, 255, 0.22)`,
          borderRadius: px(104),
        }}
      />
      <div
        style={{
          position: "absolute",
          width: px(600),
          height: px(98),
          left: px(-48),
          top: px(48),
          transform: "rotate(-28deg)",
          background: "rgba(255, 255, 255, 0.12)",
        }}
      />
      <div
        style={{
          position: "relative",
          width: px(292),
          height: px(292),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: px(76),
          background: "#ffffff",
          boxShadow: `0 ${px(28)}px ${px(70)}px rgba(6, 78, 59, 0.34)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: px(64),
            height: px(186),
            borderRadius: px(30),
            background: "#059669",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: px(186),
            height: px(64),
            borderRadius: px(30),
            background: "#059669",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: px(50),
            bottom: px(48),
            width: px(72),
            height: px(18),
            borderRadius: px(999),
            background: "#a7f3d0",
          }}
        />
      </div>
    </div>
  );
}
