import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  BackHandler,
  I18nManager,
  Platform,
  View,
  useWindowDimensions,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import Carousel, {
  type ICarouselInstance,
} from "react-native-reanimated-carousel";
import { markIntroSeen } from "@/services/intro-flag-service";
import { PitchSlide } from "./PitchSlide";
import { Slide1Voice } from "./Slide1Voice";
import { Slide2SMS } from "./Slide2SMS";
import { Slide2Offline } from "./Slide2Offline";
import { Slide3LiveMarket } from "./Slide3LiveMarket";

const COMPACT_VOICE_SLIDE_HEIGHT = 700;

interface SlideDef {
  readonly key: string;
  readonly component: React.ComponentType;
}

const SLIDES: readonly SlideDef[] = [
  { key: "voice", component: Slide1Voice },
  {
    key: Platform.OS === "android" ? "sms" : "offline",
    component: Platform.OS === "android" ? Slide2SMS : Slide2Offline,
  },
  { key: "live_market", component: Slide3LiveMarket },
];

export function PitchCarousel(): React.ReactElement {
  const { t } = useTranslation("onboarding");
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const carouselRef = useRef<ICarouselInstance>(null);
  const totalSlides = SLIDES.length;

  // RTL handling. `react-native-reanimated-carousel` v4 has no built-in
  // RTL flip — its pan gesture always treats "drag left → next index" as
  // forward. In Arabic (RTL) the user expects to drag RIGHT to advance.
  //
  // Workaround: feed the carousel a REVERSED data array in RTL so that
  // its internal "drag right → lower index" matches the narrative
  // direction. The component-side state below tracks the **narrative**
  // index (0 = first slide, N-1 = last slide) and translates to/from the
  // carousel-internal index whenever we read or write the carousel.
  const isRTL = I18nManager.isRTL;
  const carouselData = useMemo(
    () => (isRTL ? [...SLIDES].reverse() : [...SLIDES]),
    [isRTL]
  );

  /**
   * Convert between narrative position (always 0 → N-1, "first slide" →
   * "last slide") and the carousel's internal index. In LTR the two are
   * the same. In RTL they're mirrored because the data array was reversed.
   */
  const narrativeToCarousel = useCallback(
    (narrative: number): number =>
      isRTL ? totalSlides - 1 - narrative : narrative,
    [isRTL, totalSlides]
  );
  const carouselToNarrative = useCallback(
    (carousel: number): number =>
      isRTL ? totalSlides - 1 - carousel : carousel,
    [isRTL, totalSlides]
  );

  /** Tracks NARRATIVE position. Pagination dots + isLast/hasPrevious all
   *  derive from this so they stay correct regardless of locale. */
  const [currentSlide, setCurrentSlide] = useState(0);

  /**
   * Skip / Get-Started handler — used by the top-right Skip on slides 1–2 and
   * by the "Get Started" CTA on the last slide.
   *
   * Navigation MUST always run regardless of the flag write. `markIntroSeen`
   * is best-effort and already logs + swallows internally
   * (`apps/mobile/services/intro-flag-service.ts:80-90`), so it never
   * rejects to this awaiter — no try/catch is needed here. Awaiting it
   * keeps the call deterministic in the (rare) case the navigation runs
   * synchronously enough that the flag would otherwise still be in flight.
   */
  const handleComplete = useCallback(async (): Promise<void> => {
    await markIntroSeen();
    router.push("/auth");
  }, [router]);

  /**
   * `narrativeIndex` is the user-facing slide number (0..N-1). Internally
   * we translate it to the carousel's index (mirrored in RTL) and tell
   * the carousel to scroll there.
   */
  const goToSlide = useCallback(
    (narrativeIndex: number): void => {
      carouselRef.current?.scrollTo({
        index: narrativeToCarousel(narrativeIndex),
        animated: true,
      });
      setCurrentSlide(narrativeIndex);
    },
    [narrativeToCarousel]
  );

  /**
   * Per-slide advance handler:
   *  - On slides 1 and 2 → scroll forward to the next slide.
   *  - On the last slide → mark intro seen + navigate to /auth.
   */
  const handleAdvance = useCallback((): void => {
    if (currentSlide < totalSlides - 1) {
      goToSlide(currentSlide + 1);
      return;
    }
    void handleComplete();
  }, [currentSlide, totalSlides, goToSlide, handleComplete]);

  /** Last-slide back-to-previous handler. */
  const handlePrevious = useCallback((): void => {
    if (currentSlide > 0) {
      goToSlide(currentSlide - 1);
    }
  }, [currentSlide, goToSlide]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        (): boolean => {
          if (currentSlide === 0) return false;
          goToSlide(currentSlide - 1);
          return true;
        }
      );
      return () => subscription.remove();
    }, [currentSlide, goToSlide])
  );

  return (
    // Root inherits the system color scheme via the `bg-background` token
    // pair so the slides aren't locked to one mode pre-auth.
    <View className="flex-1 bg-background dark:bg-background-dark">
      <Carousel
        ref={carouselRef}
        width={screenWidth}
        height={screenHeight}
        data={carouselData}
        defaultIndex={narrativeToCarousel(0)}
        // react-native-reanimated-carousel defaults to loop=true, which
        // wraps slide 1 ←→ slide 3 when the user swipes off either end.
        // Pre-auth pitch is a strictly sequential narrative — keep
        // navigation one-way and let the explicit top-left back-arrow on
        // slides 2-3 handle backtracking.
        loop={false}
        onScrollEnd={(carouselIndex: number): void =>
          setCurrentSlide(carouselToNarrative(carouselIndex))
        }
        renderItem={({ item, index: carouselIndex }): React.ReactElement => {
          const SlideComponent = item.component;
          const narrativeIndex = carouselToNarrative(carouselIndex);
          return (
            <PitchSlide
              headline={t(`pitch_slide_${item.key}_headline`)}
              subhead={t(`pitch_slide_${item.key}_subhead`)}
              isLast={narrativeIndex === totalSlides - 1}
              hasPrevious={narrativeIndex > 0}
              isCompactLayout={
                item.key === "voice" &&
                screenHeight < COMPACT_VOICE_SLIDE_HEIGHT
              }
              slideIndex={narrativeIndex}
              totalSlides={totalSlides}
              onSkip={() => {
                void handleComplete();
              }}
              onPrevious={handlePrevious}
              onAdvance={handleAdvance}
            >
              <SlideComponent />
            </PitchSlide>
          );
        }}
      />
      {/* Pagination dots are rendered INSIDE each slide (PitchSlide) as
          part of the layout flow rather than as an absolute overlay here.
          The previous absolute `bottom: 104` calculation was off on devices
          with bottom safe-area insets / Arabic font metrics and the dots
          ended up overlapping the Continue/Get Started button (user-
          reported 2026-04-26). In-flow positioning makes the gap
          deterministic. */}
    </View>
  );
}
