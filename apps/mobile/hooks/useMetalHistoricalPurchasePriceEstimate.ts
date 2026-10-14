import {
  calculateHistoricalPurchaseEstimateDecimal,
  calculateHistoricalPurityGramPriceDecimal,
  isExactCalendarDate,
  isSupportedMetalsIsoCurrencyCode,
  resolveMetalsCurrencyMinorUnits,
  resolvePuritySelection,
  roundDecimal,
  type CurrencyInstrumentCode,
  type PurchaseDateHistoricalRatePair,
  type SupportedMetal,
} from "@monyvi/logic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  resolvePurchaseDateHistoricalRate,
  type PurchaseDateHistoricalRateResolution,
} from "@/services/metal-purchase-date-reference-service";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export type HistoricalPurchasePriceOwnership = "unset" | "estimated" | "manual";

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
  readonly marketRatePerGramDecimal: string | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly onPurchasePriceUserChange: (value: string) => void;
  readonly retry: () => void;
}

export function useMetalHistoricalPurchasePriceEstimate(
  input: UseMetalHistoricalPurchasePriceEstimateInput
): UseMetalHistoricalPurchasePriceEstimateResult {
  const { userId, isResolvingUser } = useCurrentUser();
  const resolver = input.resolveReference ?? resolvePurchaseDateHistoricalRate;
  const onPurchasePriceChange = input.onPurchasePriceChange;
  const initialOwnership: HistoricalPurchasePriceOwnership =
    input.purchasePrice.trim().length > 0 ? "manual" : "unset";
  const ownershipRef =
    useRef<HistoricalPurchasePriceOwnership>(initialOwnership);
  const [ownership, setOwnership] =
    useState<HistoricalPurchasePriceOwnership>(initialOwnership);
  const [reference, setReference] =
    useState<PurchaseDateHistoricalRatePair | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryIndex, setRetryIndex] = useState(0);
  const estimateKeyRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const referenceIdentityRef = useRef<string | null>(null);
  const referenceIdentity = JSON.stringify([
    userId,
    input.metal,
    input.purchaseDate,
    input.purchaseCurrency,
  ]);

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
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    referenceIdentityRef.current = null;
    if (ownershipRef.current === "manual") {
      setIsLoading(false);
      return;
    }

    requestSequenceRef.current += 1;
    const sequence = requestSequenceRef.current;
    setReference(null);
    clearOwnedEstimate();

    if (!hasReferencePrerequisites || isResolvingUser || userId === null) {
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsLoading(true);
    setError(null);

    void resolver({
      purchaseDate: input.purchaseDate,
      metal: input.metal,
      purchaseCurrency: input.purchaseCurrency,
      expectedUserId: userId,
      signal: controller.signal,
    })
      .then((resolution: PurchaseDateHistoricalRateResolution): void => {
        if (
          controller.signal.aborted === true ||
          sequence !== requestSequenceRef.current ||
          ownershipRef.current === "manual"
        ) {
          return;
        }
        if (resolution.status === "fetch_failed") {
          setError(resolution.error);
          return;
        }
        referenceIdentityRef.current = referenceIdentity;
        setReference(
          resolution.status === "available" ? resolution.value : null
        );
      })
      .catch((cause: unknown): void => {
        if (
          controller.signal.aborted === true ||
          sequence !== requestSequenceRef.current ||
          ownershipRef.current === "manual"
        ) {
          return;
        }
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      })
      .finally((): void => {
        if (
          controller.signal.aborted !== true &&
          sequence === requestSequenceRef.current &&
          ownershipRef.current !== "manual"
        ) {
          setIsLoading(false);
        }
      });

    return (): void => {
      controller.abort();
      if (requestControllerRef.current === controller)
        requestControllerRef.current = null;
    };
  }, [
    clearOwnedEstimate,
    hasReferencePrerequisites,
    input.metal,
    input.purchaseCurrency,
    input.purchaseDate,
    resolver,
    retryIndex,
    isResolvingUser,
    userId,
    referenceIdentity,
  ]);

  useEffect(() => {
    if (ownershipRef.current === "manual") return;

    if (
      !reference ||
      referenceIdentityRef.current !== referenceIdentity ||
      isResolvingUser ||
      userId === null ||
      !purity.available ||
      !hasWeight
    ) {
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
      purityCode: purity.entry.code,
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
    referenceIdentity,
    isResolvingUser,
    userId,
  ]);

  const onPurchasePriceUserChange = useCallback(
    (value: string): void => {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      referenceIdentityRef.current = null;
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

  const marketRatePerGramDecimal = useMemo((): string | null => {
    if (
      ownership !== "estimated" ||
      reference === null ||
      referenceIdentityRef.current !== referenceIdentity ||
      !purity.available
    )
      return null;
    return calculateHistoricalPurityGramPriceDecimal({
      purityCode: purity.entry.code,
      purityFactorDecimal: purity.entry.factorDecimal,
      pair: reference,
    });
  }, [ownership, reference, referenceIdentity, purity]);

  return {
    ownership,
    marketRatePerGramDecimal,
    isLoading,
    error,
    onPurchasePriceUserChange,
    retry,
  };
}
