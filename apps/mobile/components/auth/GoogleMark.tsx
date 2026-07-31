import React from "react";
import Svg, { Path } from "react-native-svg";

import { palette } from "@/constants/colors";

interface GoogleMarkProps {
  readonly size?: number;
}

export function GoogleMark({ size = 20 }: GoogleMarkProps): React.JSX.Element {
  return (
    <Svg
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      width={size}
      height={size}
      viewBox="0 0 18 18"
    >
      <Path
        fill={palette.brand.googleBlue}
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.258h2.909c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <Path
        fill={palette.brand.googleGreen}
        d="M9 18c2.43 0 4.468-.806 5.956-2.18l-2.909-2.258c-.806.54-1.836.859-3.047.859-2.344 0-4.329-1.585-5.037-3.711H.956v2.333A9 9 0 0 0 9 18z"
      />
      <Path
        fill={palette.brand.googleYellow}
        d="M3.963 10.71A5.42 5.42 0 0 1 3.682 9c0-.593.102-1.17.281-1.71V4.957H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.043l3.007-2.333z"
      />
      <Path
        fill={palette.brand.googleRed}
        d="M9 3.579c1.322 0 2.508.454 3.441 1.346l2.582-2.582C13.464.892 11.43 0 9 0A9 9 0 0 0 .956 4.957L3.963 7.29C4.671 5.164 6.656 3.579 9 3.579z"
      />
    </Svg>
  );
}
