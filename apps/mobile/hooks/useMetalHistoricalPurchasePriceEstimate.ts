import {
  calculateHistoricalPurchaseEstimateDecimal,
  isExactCalendarDate,
  isSupportedMetalsIsoCurrencyCode,
  resolveMetalsCurrencyMinorUnits,
  resolvePuritySelection,
  roundDecimal,
  type CurrencyInstrumentCode,
  type PurchaseDateHistoricalRatePair,
  type SupportedMetal,
} from "@monyvi/logic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  resolvePurchaseDateHistoricalRate,
  type PurchaseDateHistoricalRateResolution,
} from "@/services/metal-purchase-date-reference-service";

export type HistoricalPurchasePriceOwnership =
  | "unset"
  | "estimated"
  | "manual";

export interface UseMetalHistoricalPurchasePriceEstimateInput {
  readonly metal: SupportedMetal;
  readonly weightGrams: string;
  readonly purityCode: string;
  readonly purchaseCurrency: string;
  readonly purchaseDate: string;
  readonly purchasePrice: string;
  readonly onPurchasePriceChange: (value: string) => void;
  readonly resolveReference?: typeof resolvePurchaseDateHistoricalRate;
}

export interface UseMetalHistoricalPurchasePriceEstimateResult {
  readonly ownership: HistoricalPurchasePriceOwnership;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly onPurchasePriceUserChange: (value: string) => void;
  readonly retry: () => void;
}

export function useMetalHistoricalPurchasePriceEstimate(
  input: UseMetalHistoricalPurchasePriceEstimateInput
): UseMetalHistoricalPurchasePriceEstimateResult {
  const resolver = input.resolveReference ?? resolvePurchaseDateHistoricalRate;
  const onPurchasePriceChange = input.onPurchasePriceChange;
  const initialOwnership: HistoricalPurchasePriceOwnership =
    input.purchasePrice.trim().length > 0 ? "manual" : "unset";
  const ownershipRef = useRef<HistoricalPurchasePriceOwnership>(
    initialOwnership
  );
  const [ownership, setOwnership] =
    useState<HistoricalPurchasePriceOwnership>(initialOwnership);
  const [reference, setReference] =
    useState<PurchaseDateHistoricalRatePair | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryIndex, setRetryIndex] = useState(0);
  const estimateKeyRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);

  const purity = useMemo(
    () => resolvePuritySelection(input.metal, input.purityCode),
    [input.metal, input.purityCode]
  );
  const hasWeight = input.weightGrams.trim().length > 0;
  const hasReferencePrerequisites =
    hasWeight &&
    purity.available &&
    isExactCalendarDate(input.purchaseDate) &&
    isSupportedMetalsIsoCurrencyCode(input.purchaseCurrency);

  const setOwnershipState = useCallback(
    (value: HistoricalPurchasePriceOwnership): void => {
      ownershipRef.current = value;
      setOwnership(value);
    },
    []
  );

  const clearOwnedEstimate = useCallback((): void => {
    if (ownershipRef.current !== "estimated") return;
    estimateKeyRef.current = null;
    setOwnershipState("unset");
    onPurchasePriceChange("");
  }, [onPurchasePriceChange, setOwnershipState]);

  useEffect(() => {
    if (ownershipRef.current === "manual") {
      setIsLoading(false);
      return;
    }

    requestSequenceRef.current += 1;
    const sequence = requestSequenceRef.current;
    setReference(null);
    clearOwnedEstimate();

    if (!hasReferencePrerequisites) {
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void resolver({
      purchaseDate: input.purchaseDate,
      metal: input.metal,
      purchaseCurrency: input.purchaseCurrency,
    })
      .then((resolution: PurchaseDateHistoricalRateResolution): void => {
        if (
          cancelled ||
          sequence !== requestSequenceRef.current ||
          ownershipRef.current === "manual"
        ) {
          return;
        }
        if (resolution.status === "fetch_failed") {
          setError(resolution.error);
          return;
        }
        setReference(
          resolution.status === "available" ? resolution.value : null
        );
      })
      .catch((cause: unknown): void => {
        if (
          cancelled ||
          sequence !== requestSequenceRef.current ||
          ownershipRef.current === "manual"
        ) {
          return;
        }
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally((): void => {
        if (
          !cancelled &&
          sequence === requestSequenceRef.current &&
          ownershipRef.current !== "manual"
        ) {
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [
    clearOwnedEstimate,
    hasReferencePrerequisites,
    input.metal,
    input.purchaseCurrency,
    input.purchaseDate,
    resolver,
    retryIndex,
  ]);

  useEffect(() => {
    if (ownershipRef.current === "manual") return;

    if (!reference || !purity.available || !hasWeight) {
      clearOwnedEstimate();
      return;
    }

    const currencyMinorUnits = isSupportedMetalsIsoCurrencyCode(
      input.purchaseCurrency
    )
      ? resolveMetalsCurrencyMinorUnits(
          ("currency:" + input.purchaseCurrency) as CurrencyInstrumentCode
        )
      : null;
    if (currencyMinorUnits === null) {
      clearOwnedEstimate();
      return;
    }

    const estimate = calculateHistoricalPurchaseEstimateDecimal({
      weightGramsDecimal: input.weightGrams,
      purityFactorDecimal: purity.entry.factorDecimal,
      pair: reference,
    });
    if (estimate === null) {
      clearOwnedEstimate();
      return;
    }

    const estimateKey = [
      reference.rateDate,
      input.metal,
      input.weightGrams,
      input.purityCode,
      input.purchaseCurrency,
    ].join("|");
    const fieldValue = roundDecimal(estimate, currencyMinorUnits);
    if (
      estimateKeyRef.current === estimateKey &&
      ownershipRef.current === "estimated"
    ) {
      return;
    }

    estimateKeyRef.current = estimateKey;
    setOwnershipState("estimated");
    onPurchasePriceChange(fieldValue);
  }, [
    clearOwnedEstimate,
    hasWeight,
    input.metal,
    input.purchaseCurrency,
    input.purityCode,
    input.weightGrams,
    onPurchasePriceChange,
    purity,
    reference,
    setOwnershipState,
  ]);

  const onPurchasePriceUserChange = useCallback(
    (value: string): void => {
      requestSequenceRef.current += 1;
      estimateKeyRef.current = null;
      setReference(null);
      setIsLoading(false);
      setError(null);
      setOwnershipState("manual");
      onPurchasePriceChange(value);
    },
    [onPurchasePriceChange, setOwnershipState]
  );

  const retry = useCallback((): void => {
    if (ownershipRef.current === "manual") return;
    setRetryIndex((value) => value + 1);
  }, []);

  return {
    ownership,
    isLoading,
    error,
    onPurchasePriceUserChange,
    retry,
  };
}
