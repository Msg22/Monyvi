import { useEffect, useState, type ReactNode } from "react";
import {
  Image,
  type ImageSourcePropType,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";

import { palette } from "@/constants/colors";
import type { InstitutionLogo } from "@/constants/egyptian-institution-assets";
import { useTheme } from "@/context/ThemeContext";
import { Skeleton } from "@/components/ui/Skeleton";

export type InstitutionLogoMarkSize =
  | "compact"
  | "row"
  | "account-list"
  | "dashboard"
  | "preview";

interface InstitutionLogoMarkProps {
  readonly logo: InstitutionLogo | null;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
  readonly size?: InstitutionLogoMarkSize;
  readonly fallback?: ReactNode;
  readonly surfaceContext?: "default" | "colored-card";
  readonly defaultSurfaceClassName?: string;
  readonly defaultSurfaceStyle?: StyleProp<ViewStyle>;
  readonly containerClassName?: string;
}

interface LogoDimensions {
  readonly width: number;
  readonly height: number;
}

type AppLogoViewport =
  | "standard"
  | "inset"
  | "safeInset"
  | "safeSquare"
  | "square"
  | "wide";

export function InstitutionLogoMark({
  logo,
  accessibilityLabel,
  testID,
  size = "compact",
  fallback = null,
  surfaceContext = "default",
  defaultSurfaceClassName = "border-transparent bg-transparent",
  defaultSurfaceStyle,
  containerClassName = "",
}: InstitutionLogoMarkProps): React.JSX.Element {
  const { isDark } = useTheme();
  const imageSource = getImageSource(logo, size);
  const InstitutionSvgLogo =
    !imageSource && logo?.format === "svg" && typeof logo.source === "function"
      ? logo.source
      : null;
  const logoSurface = getLogoSurface({
    logo,
    isDark,
    surfaceContext,
    defaultClassName: defaultSurfaceClassName,
    defaultStyle: defaultSurfaceStyle,
  });
  const appLogoViewport = getAppLogoViewport(logo, size);
  const logoDimensions = getLogoDimensions(logo, size, appLogoViewport);
  const imageResizeMode =
    size === "row"
      ? (logo?.presentation?.rowImageResizeMode ?? "contain")
      : "contain";
  const imageSizeClassName = getImageSizeClassName(logo, size, appLogoViewport);
  const isBundledImageSource =
    imageSource !== undefined && logo?.appSource === imageSource;
  const [isImageLoading, setIsImageLoading] = useState(
    imageSource !== undefined && !isBundledImageSource
  );

  useEffect(() => {
    setIsImageLoading(imageSource !== undefined && !isBundledImageSource);
  }, [imageSource, isBundledImageSource]);

  return (
    <View
      className={`${containerClassName}  items-center justify-center overflow-hidden border ${logoSurface.className} ${getContainerSizeClassName(size)}`}
      style={logoSurface.style}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {InstitutionSvgLogo ? (
        <InstitutionSvgLogo
          width={logoDimensions.width}
          height={logoDimensions.height}
          testID={testID ? `${testID} svg` : undefined}
        />
      ) : imageSource ? (
        <>
          {isImageLoading ? (
            <View className="absolute inset-0 items-center justify-center">
              <Skeleton
                width="100%"
                height={getSkeletonHeight(size)}
                borderRadius={getSkeletonBorderRadius(size)}
              />
            </View>
          ) : null}
          <Image
            source={imageSource}
            resizeMode={imageResizeMode}
            className={imageSizeClassName}
            testID={testID ? `${testID} image` : undefined}
            onLoadStart={() => {
              if (!isBundledImageSource) setIsImageLoading(true);
            }}
            onLoadEnd={() => setIsImageLoading(false)}
            onError={() => setIsImageLoading(false)}
          />
        </>
      ) : (
        fallback
      )}
    </View>
  );
}

function getSkeletonHeight(size: InstitutionLogoMarkSize): number {
  switch (size) {
    case "row":
    case "account-list":
      return 48;
    case "dashboard":
      return 36;
    case "preview":
    case "compact":
    default:
      return 44;
  }
}

function getSkeletonBorderRadius(size: InstitutionLogoMarkSize): number {
  switch (size) {
    case "account-list":
    case "preview":
      return 16;
    case "row":
    case "dashboard":
    case "compact":
    default:
      return 12;
  }
}

function getImageSource(
  logo: InstitutionLogo | null,
  size: InstitutionLogoMarkSize
): ImageSourcePropType | undefined {
  if (!logo) {
    return undefined;
  }

  if (
    logo.appSource &&
    (size === "row" ||
      size === "account-list" ||
      size === "dashboard" ||
      size === "preview" ||
      size === "compact")
  ) {
    return logo.appSource;
  }

  if (logo.format !== "image") {
    return undefined;
  }

  return logo.source;
}

function getLogoSurface({
  logo,
  isDark,
  surfaceContext,
  defaultClassName,
  defaultStyle,
}: {
  readonly logo: InstitutionLogo | null;
  readonly isDark: boolean;
  readonly surfaceContext: "default" | "colored-card";
  readonly defaultClassName: string;
  readonly defaultStyle?: StyleProp<ViewStyle>;
}): {
  readonly className: string;
  readonly style?: StyleProp<ViewStyle>;
} {
  if (
    surfaceContext === "colored-card" &&
    logo?.presentation?.needsColoredCardSurface
  ) {
    return {
      className: "border-transparent bg-transparent",
      style: {
        backgroundColor: palette.slate[25],
        borderColor: palette.slate[300],
      },
    };
  }

  if (logo?.presentation?.needsDarkSurface) {
    return {
      className: "border-transparent bg-transparent",
      style: {
        backgroundColor: palette.slate[950],
        borderColor: palette.slate[700],
      },
    };
  }

  if (logo?.presentation?.needsDarkModeLightSurface) {
    if (!isDark) {
      return {
        className: defaultClassName,
        style: defaultStyle,
      };
    }

    return {
      className: "border-transparent bg-transparent",
      style: {
        backgroundColor: palette.slate[25],
        borderColor: palette.slate[600],
      },
    };
  }

  if (logo?.presentation?.needsLightModeDarkSurface) {
    if (isDark) {
      return {
        className: defaultClassName,
        style: defaultStyle,
      };
    }

    return {
      className: "border-transparent bg-transparent",
      style: {
        backgroundColor: palette.slate[950],
        borderColor: palette.slate[700],
      },
    };
  }

  if (logo?.presentation?.needsContrastSurface) {
    return {
      className: "border-transparent bg-transparent",
      style: {
        backgroundColor: isDark ? palette.slate[25] : palette.slate[100],
        borderColor: isDark ? palette.slate[600] : palette.slate[200],
      },
    };
  }

  return {
    className: defaultClassName,
    style: defaultStyle,
  };
}

function getContainerSizeClassName(size: InstitutionLogoMarkSize): string {
  switch (size) {
    case "row":
      return "h-12 w-16 rounded-xl";
    case "account-list":
      return "h-12 w-16 rounded-2xl";
    case "dashboard":
      return "h-9 w-12 rounded-xl";
    case "preview":
      return "h-11 w-11 rounded-2xl";
    case "compact":
    default:
      return "h-11 w-11 rounded-xl";
  }
}

function getAppLogoViewport(
  logo: InstitutionLogo | null,
  size: InstitutionLogoMarkSize
): AppLogoViewport {
  if (
    size !== "row" &&
    size !== "compact" &&
    size !== "account-list" &&
    size !== "dashboard" &&
    size !== "preview"
  ) {
    return "standard";
  }

  if (size === "preview" && logo?.presentation?.previewLogoViewport) {
    return logo.presentation.previewLogoViewport;
  }

  return logo?.presentation?.appLogoViewport ?? "standard";
}

function getLogoDimensions(
  logo: InstitutionLogo | null,
  size: InstitutionLogoMarkSize,
  appLogoViewport: AppLogoViewport
): LogoDimensions {
  if (size === "row") {
    if (appLogoViewport === "square") {
      return { width: 42, height: 42 };
    }

    if (appLogoViewport === "wide") {
      return { width: 52, height: 34 };
    }

    if (appLogoViewport === "inset") {
      return { width: 48, height: 32 };
    }

    if (appLogoViewport === "safeInset") {
      return { width: 42, height: 28 };
    }

    if (appLogoViewport === "safeSquare") {
      return { width: 40, height: 40 };
    }

    if (logo?.presentation?.rowSvgViewport === "full") {
      return { width: 64, height: 48 };
    }

    if (logo?.presentation?.rowSvgViewport === "inset") {
      return { width: 48, height: 32 };
    }

    return { width: 56, height: 40 };
  }

  if (size === "account-list") {
    if (appLogoViewport === "square") {
      return { width: 46, height: 46 };
    }

    if (appLogoViewport === "wide") {
      return { width: 58, height: 38 };
    }

    if (appLogoViewport === "inset") {
      return { width: 44, height: 30 };
    }

    if (appLogoViewport === "safeInset") {
      return { width: 40, height: 28 };
    }

    if (appLogoViewport === "safeSquare") {
      return { width: 42, height: 42 };
    }

    return { width: 56, height: 40 };
  }

  if (size === "dashboard") {
    if (appLogoViewport === "square") {
      return { width: 34, height: 34 };
    }

    if (appLogoViewport === "wide") {
      return { width: 46, height: 30 };
    }

    if (appLogoViewport === "inset") {
      return { width: 36, height: 24 };
    }

    if (appLogoViewport === "safeInset") {
      return { width: 32, height: 22 };
    }

    if (appLogoViewport === "safeSquare") {
      return { width: 32, height: 32 };
    }

    return { width: 44, height: 32 };
  }

  if (size === "preview") {
    if (appLogoViewport === "square") {
      return { width: 42, height: 42 };
    }

    if (appLogoViewport === "wide") {
      return { width: 42, height: 30 };
    }

    if (appLogoViewport === "inset") {
      return { width: 40, height: 30 };
    }

    if (appLogoViewport === "safeInset") {
      return { width: 34, height: 24 };
    }

    if (appLogoViewport === "safeSquare") {
      return { width: 40, height: 40 };
    }

    return { width: 36, height: 36 };
  }

  return { width: 36, height: 36 };
}

function getImageSizeClassName(
  logo: InstitutionLogo | null,
  size: InstitutionLogoMarkSize,
  appLogoViewport: AppLogoViewport
): string {
  const imageResizeMode = logo?.presentation?.rowImageResizeMode ?? "contain";

  if (size === "row" && imageResizeMode === "cover") {
    return "h-12 w-16 rounded-xl";
  }

  if (size === "row" && logo?.presentation?.rowImageViewport === "inset") {
    return "h-9 w-12";
  }

  switch (size) {
    case "row":
      if (appLogoViewport === "square") {
        return "h-10 w-10";
      }

      if (appLogoViewport === "wide") {
        return "h-10 w-14";
      }

      if (appLogoViewport === "inset") {
        return "h-9 w-12";
      }

      if (appLogoViewport === "safeInset") {
        return "h-8 w-10";
      }

      if (appLogoViewport === "safeSquare") {
        return "h-10 w-10";
      }

      return "h-10 w-14";
    case "account-list":
      if (appLogoViewport === "square") {
        return "h-12 w-12";
      }

      if (appLogoViewport === "wide") {
        return "h-10 w-14";
      }

      if (appLogoViewport === "inset") {
        return "h-8 w-11";
      }

      if (appLogoViewport === "safeInset") {
        return "h-7 w-10";
      }

      if (appLogoViewport === "safeSquare") {
        return "h-10 w-10";
      }

      return "h-10 w-14";
    case "dashboard":
      if (appLogoViewport === "square") {
        return "h-9 w-9";
      }

      if (appLogoViewport === "wide") {
        return "h-8 w-11";
      }

      if (appLogoViewport === "inset") {
        return "h-7 w-10";
      }

      if (appLogoViewport === "safeInset") {
        return "h-6 w-9";
      }

      if (appLogoViewport === "safeSquare") {
        return "h-8 w-8";
      }

      return "h-8 w-11";
    case "preview":
      if (appLogoViewport === "square") {
        return "h-11 w-11";
      }

      if (appLogoViewport === "wide") {
        return "h-8 w-11";
      }

      if (appLogoViewport === "inset") {
        return "h-8 w-10";
      }

      if (appLogoViewport === "safeInset") {
        return "h-7 w-9";
      }

      if (appLogoViewport === "safeSquare") {
        return "h-10 w-10";
      }

      return "h-9 w-9";
    case "compact":
    default:
      return "h-9 w-9";
  }
}
