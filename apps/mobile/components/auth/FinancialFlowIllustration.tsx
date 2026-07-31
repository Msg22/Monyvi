import React from "react";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";

interface FinancialFlowIllustrationProps {
  readonly direction: "ltr" | "rtl";
  readonly flowColor: string;
  readonly mutedFlowColor: string;
  readonly accentColor: string;
  readonly accentSoftColor: string;
  readonly surfaceColor: string;
  readonly width?: number;
  readonly height?: number;
}

interface IllustrationPartProps {
  readonly flowColor: string;
  readonly mutedFlowColor: string;
  readonly surfaceColor: string;
}

const FLOW_STROKE_WIDTH = 2.65;
const MUTED_STROKE_WIDTH = 2.25;

export function FinancialFlowIllustration({
  direction,
  flowColor,
  mutedFlowColor,
  accentColor,
  accentSoftColor,
  surfaceColor,
  width = 180,
  height = 215,
}: FinancialFlowIllustrationProps): React.JSX.Element {
  const isRTL = direction === "rtl";

  return (
    <Svg
      testID={`financial-flow-${direction}`}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      width={width}
      height={height}
      viewBox="0 0 360 430"
    >
      <Connections
        isRTL={isRTL}
        flowColor={flowColor}
        mutedFlowColor={mutedFlowColor}
        surfaceColor={surfaceColor}
      />
      <Voice
        transform={isRTL ? "translate(27 27)" : "translate(278 27)"}
        flowColor={flowColor}
        mutedFlowColor={mutedFlowColor}
      />
      <BankMessage
        transform={isRTL ? "translate(24 112)" : "translate(281 112)"}
        flowColor={flowColor}
      />
      <Currency
        transform={isRTL ? "translate(18 196)" : "translate(280 196)"}
        flowColor={flowColor}
        mutedFlowColor={mutedFlowColor}
        surfaceColor={surfaceColor}
      />
      <GoldCoin
        transform={isRTL ? "translate(30 280)" : "translate(280 280)"}
        accentColor={accentColor}
        accentSoftColor={accentSoftColor}
      />
      <Ledger
        isRTL={isRTL}
        flowColor={flowColor}
        mutedFlowColor={mutedFlowColor}
        surfaceColor={surfaceColor}
      />
    </Svg>
  );
}

interface ConnectionsProps extends IllustrationPartProps {
  readonly isRTL: boolean;
}

function Connections({
  isRTL,
  flowColor,
  mutedFlowColor,
  surfaceColor,
}: ConnectionsProps): React.JSX.Element {
  return (
    <G
      testID={`financial-flow-connections-${isRTL ? "rtl" : "ltr"}`}
      transform={isRTL ? "translate(360 0) scale(-1 1)" : undefined}
    >
      <Path
        d="M18 174C79 174 94 210 94 258v22c0 31 27 45 62 54"
        fill="none"
        opacity={0.62}
        stroke={mutedFlowColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={MUTED_STROKE_WIDTH}
      />
      <FlowPath
        d="M270 55h-17c-39 0-59 19-59 58v143c0 43-17 62-38 78"
        color={flowColor}
      />
      <FlowPath
        d="M273 137h-15c-35 0-53 20-53 55v70c0 39-21 59-49 72"
        color={flowColor}
      />
      <FlowPath
        d="M272 220h-8c-34 0-48 19-48 49 0 35-26 54-60 65"
        color={flowColor}
      />
      <FlowPath d="M270 302c-30 0-41 13-62 22l-52 10" color={flowColor} />
      <Circle cx={156} cy={334} r={5} fill={flowColor} />
      <FlowPath d="M156 339v18" color={flowColor} />
      {isRTL ? (
        <G transform="translate(96 355)">
          <Circle
            cx={60}
            cy={37}
            r={37}
            fill={surfaceColor}
            stroke={flowColor}
            strokeWidth={2.4}
          />
        </G>
      ) : null}
    </G>
  );
}

interface TransformProps {
  readonly transform: string;
}

interface VoiceProps extends TransformProps {
  readonly flowColor: string;
  readonly mutedFlowColor: string;
}

function Voice({
  transform,
  flowColor,
  mutedFlowColor,
}: VoiceProps): React.JSX.Element {
  return (
    <G testID="financial-flow-voice" transform={transform}>
      <Path
        d="M0 28v-7M7 32V16M14 35V13M21 31V17M28 27v-5"
        fill="none"
        stroke={mutedFlowColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={MUTED_STROKE_WIDTH}
      />
      <FlowPath
        d="M53 12v11a7 7 0 0 1-14 0V12a7 7 0 0 1 14 0zM35 23a11 11 0 0 0 22 0M46 34v8M41 42h10"
        color={flowColor}
      />
    </G>
  );
}

interface BankMessageProps extends TransformProps {
  readonly flowColor: string;
}

function BankMessage({
  transform,
  flowColor,
}: BankMessageProps): React.JSX.Element {
  return (
    <G transform={transform}>
      <FlowPath
        d="M4 0h44a7 7 0 0 1 7 7v25a7 7 0 0 1-7 7H26L14 48v-9H7a7 7 0 0 1-7-7V7a7 7 0 0 1 7-7z"
        color={flowColor}
      />
      {[17, 28, 39].map((cx) => (
        <Circle key={cx} cx={cx} cy={19.5} r={2.7} fill={flowColor} />
      ))}
    </G>
  );
}

type CurrencyProps = TransformProps & IllustrationPartProps;

function Currency({
  transform,
  flowColor,
  mutedFlowColor,
  surfaceColor,
}: CurrencyProps): React.JSX.Element {
  return (
    <G testID="financial-flow-currency" transform={transform}>
      <Path
        d="M7 7h48a5 5 0 0 1 5 5v28a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V12a5 5 0 0 1 5-5z"
        fill={surfaceColor}
        stroke={flowColor}
        strokeWidth={2.5}
      />
      <FlowPath d="M10 15h5M47 15h5M10 37h5M47 37h5" color={flowColor} />
      <Circle
        cx={31}
        cy={26}
        r={9}
        fill={surfaceColor}
        stroke={flowColor}
        strokeWidth={2.4}
      />
      <Path
        d="M27 22h8M27 26h8M27 30h5"
        fill="none"
        stroke={mutedFlowColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={MUTED_STROKE_WIDTH}
      />
    </G>
  );
}

interface GoldCoinProps extends TransformProps {
  readonly accentColor: string;
  readonly accentSoftColor: string;
}

function GoldCoin({
  transform,
  accentColor,
  accentSoftColor,
}: GoldCoinProps): React.JSX.Element {
  return (
    <G testID="financial-flow-gold" transform={transform}>
      <Circle
        cx={25}
        cy={25}
        r={22}
        fill={accentSoftColor}
        stroke={accentColor}
        strokeWidth={2.4}
      />
      <Circle
        cx={25}
        cy={25}
        r={16}
        fill="none"
        opacity={0.82}
        stroke={accentColor}
        strokeWidth={1.7}
      />
      <SvgText
        x={25}
        y={30}
        fill={accentColor}
        fontFamily="serif"
        fontSize={15}
        fontWeight="700"
        textAnchor="middle"
      >
        Au
      </SvgText>
    </G>
  );
}

interface LedgerProps extends IllustrationPartProps {
  readonly isRTL: boolean;
}

function Ledger({
  isRTL,
  flowColor,
  mutedFlowColor,
  surfaceColor,
}: LedgerProps): React.JSX.Element {
  const transform = isRTL ? "translate(144 355)" : "translate(96 355)";

  return (
    <G testID="financial-flow-ledger" transform={transform}>
      {!isRTL ? (
        <Circle
          cx={60}
          cy={37}
          r={37}
          fill={surfaceColor}
          stroke={flowColor}
          strokeWidth={2.4}
        />
      ) : null}
      <Rect
        x={35}
        y={17}
        width={28}
        height={39}
        rx={3}
        fill={surfaceColor}
        stroke={flowColor}
        strokeWidth={2.4}
      />
      <Path
        d="M42 28h14M42 37h14M42 46h9"
        fill="none"
        stroke={mutedFlowColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={MUTED_STROKE_WIDTH}
      />
      <FlowPath
        testID="financial-flow-check-normal"
        d="m70 55 7 7 12-16"
        color={flowColor}
      />
    </G>
  );
}

interface FlowPathProps {
  readonly d: string;
  readonly testID?: string;
  readonly color: string;
}

function FlowPath({ d, color, testID }: FlowPathProps): React.JSX.Element {
  return (
    <Path
      testID={testID}
      d={d}
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={FLOW_STROKE_WIDTH}
    />
  );
}
