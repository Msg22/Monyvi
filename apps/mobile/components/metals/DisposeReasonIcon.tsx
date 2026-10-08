import React from "react";
import { Circle, Path, Polyline, Svg } from "react-native-svg";

import type { DisposeCategory } from "@/services/dispose-metal-holding-command-service";

interface DisposeReasonIconProps {
  readonly reason: DisposeCategory;
  readonly color: string;
  readonly testID: string;
}

export function DisposeReasonIcon({
  reason,
  color,
  testID,
}: DisposeReasonIconProps): React.JSX.Element {
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <Svg
      testID={testID}
      accessible={false}
      width={22}
      height={22}
      viewBox="0 0 24 24"
    >
      {reason === "lost_or_stolen" ? (
        <>
          <Path
            {...common}
            d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"
          />
          <Circle {...common} cx="12" cy="10" r="2.1" />
        </>
      ) : null}

      {reason === "destroyed_or_damaged" ? (
        <>
          <Path
            {...common}
            d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z"
          />
          <Polyline
            {...common}
            points="13 6.5 10.5 10.5 13 12 10.5 16.5"
          />
        </>
      ) : null}

      {reason === "given_away" ? (
        <>
          <Path {...common} d="M4 10h16v10H4V10Z" />
          <Path {...common} d="M3 7h18v3H3V7Z" />
          <Path {...common} d="M12 7v13" />
          <Path {...common} d="M12 7H8.8a2.3 2.3 0 1 1 2.3-2.3L12 7Z" />
          <Path {...common} d="M12 7h3.2a2.3 2.3 0 1 0-2.3-2.3L12 7Z" />
        </>
      ) : null}

      {reason === "donated" ? (
        <>
          <Path
            {...common}
            d="M12 7.8c-1.5-2-4.7-1-4.7 1.7 0 2.1 2 3.4 4.7 5.5 2.7-2.1 4.7-3.4 4.7-5.5 0-2.7-3.2-3.7-4.7-1.7Z"
          />
          <Path
            {...common}
            d="M3.5 15.5h4.7l2.2 2h4.4c1.1 0 2.1-.4 2.8-1.2l2.4-2.5"
          />
          <Path
            {...common}
            d="M3.5 18.5h5.2l2.1 1.5h4.6c1.7 0 3.1-.7 4.1-2l1-1.2"
          />
        </>
      ) : null}

      {reason === "other" ? (
        <>
          <Path {...common} d="M4 5h16v11H11l-4 3v-3H4V5Z" />
          <Circle cx="9" cy="10.5" r="1" fill={color} />
          <Circle cx="12" cy="10.5" r="1" fill={color} />
          <Circle cx="15" cy="10.5" r="1" fill={color} />
        </>
      ) : null}
    </Svg>
  );
}
