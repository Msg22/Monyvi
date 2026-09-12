import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import type { Budget, BudgetPeriod, CurrencyType } from "@monyvi/db";
import {
  createBudget,
  updateBudget,
  type CreateBudgetInput,
  type UpdateBudgetInput,
} from "@/services/budget-service";
import { useToast } from "@/components/ui/Toast";
import { router } from "expo-router";
import { useCategories } from "@/hooks/useCategories";
import { useCategoryLookup } from "@/context/CategoriesContext";
import { usePreferredCurrency } from "@/hooks/usePreferredCurrency";
import { formatDate } from "@/utils/dateHelpers";
import {
  calculateBudgetAlertAmount,
  getCurrentPeriodBounds,
  parsePositiveMoneyAmount,
} from "@monyvi/logic";
import {
  buildBudgetRenewalFormValues,
  resolveRenewalCategoryId,
  type BudgetFormInitialValues,
  type BudgetRenewalSource,
} from "./budget-renewal-form-values";

export interface BudgetFormProps {
  readonly existingBudget?: Budget;
  readonly renewalSource?: BudgetRenewalSource;
}

export type BudgetFormState = BudgetFormInitialValues;

export interface BudgetFormErrors {
  name?: string;
  amount?: string;
  category?: string;
  period?: string;
  general?: string;
}

export const BUDGET_PERIOD_LABELS: Record<BudgetPeriod, string> = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  CUSTOM: "custom_period",
};

export const BUDGET_PERIOD_KEYS: BudgetPeriod[] = [
  "WEEKLY",
  "MONTHLY",
  "CUSTOM",
];

const DEFAULT_THRESHOLD = 80;

type SetForm = Dispatch<SetStateAction<BudgetFormState>>;
type SetErrors = Dispatch<SetStateAction<BudgetFormErrors>>;
type UpdateBudgetFormField = <K extends keyof BudgetFormState>(
  key: K,
  value: BudgetFormState[K]
) => void;

interface FormMutators {
  readonly updateField: UpdateBudgetFormField;
  readonly handleScopeChange: (type: BudgetFormState["type"]) => void;
}

interface BudgetFormResources {
  readonly expenseCategories: ReturnType<
    typeof useCategories
  >["expenseCategories"];
  readonly areCategoriesLoading: boolean;
  readonly categoryError: ReturnType<typeof useCategories>["error"];
  readonly retryCategories: ReturnType<typeof useCategories>["retry"];
  readonly categoryMap: ReturnType<typeof useCategoryLookup>;
  readonly accessibleCategoryIds: ReadonlySet<string>;
  readonly preferredCurrency: CurrencyType;
  readonly isPreferredCurrencyLoading: boolean;
}

interface BudgetFormCoreState {
  readonly form: BudgetFormState;
  readonly setForm: SetForm;
  readonly errors: BudgetFormErrors;
  readonly setErrors: SetErrors;
  readonly hasUserSelectedCurrency: boolean;
  readonly setHasUserSelectedCurrency: Dispatch<SetStateAction<boolean>>;
  readonly isEditMode: boolean;
  readonly isRenewalMode: boolean;
}

type BudgetFormModel = BudgetFormResources &
  BudgetFormCoreState &
  FormMutators & {
    readonly categoryDisplayName: string | undefined;
    readonly isWaitingForCreateCurrency: boolean;
  };

type PersistBudget = (
  amount: number,
  currency: BudgetFormState["currency"]
) => Promise<void>;

interface BudgetSubmitHandlers {
  readonly handleSubmit: () => Promise<void>;
  readonly handleConfirmRenewal: () => Promise<void>;
}

interface BudgetPreview {
  readonly amount: number | null;
  readonly alertAmount: number | null;
  readonly startDate: string;
  readonly secondaryDate: string;
}

interface BudgetOverlayState {
  readonly isCategoryModalOpen: boolean;
  readonly isCurrencyPickerOpen: boolean;
  readonly showStartPicker: boolean;
  readonly showEndPicker: boolean;
  readonly openCategoryModal: () => void;
  readonly closeCategoryModal: () => void;
  readonly openCurrencyPicker: () => void;
  readonly closeCurrencyPicker: () => void;
  readonly openStartPicker: () => void;
  readonly closeStartPicker: () => void;
  readonly openEndPicker: () => void;
  readonly closeEndPicker: () => void;
  readonly selectCategory: (id: string) => void;
  readonly selectCurrency: (currency: CurrencyType) => void;
}

export type BudgetFormController = BudgetFormModel &
  BudgetOverlayState &
  BudgetSubmitHandlers & {
    readonly preview: BudgetPreview;
    readonly isSubmitting: boolean;
    readonly isSubmitDisabled: boolean;
    readonly showRenewalConfirmation: boolean;
    readonly cancelRenewalConfirmation: () => void;
    readonly cancelForm: () => void;
  };

function buildInitialState(
  existingBudget: Budget | undefined,
  renewalSource: BudgetRenewalSource | undefined,
  preferredCurrency: CurrencyType,
  categoriesReady: boolean,
  accessibleCategoryIds: ReadonlySet<string>
): BudgetFormState {
  if (renewalSource) {
    return buildBudgetRenewalFormValues(
      renewalSource,
      new Date(),
      categoriesReady ? accessibleCategoryIds : undefined
    );
  }

  return {
    name: existingBudget?.name ?? "",
    type: existingBudget?.type ?? "CATEGORY",
    categoryId: existingBudget?.categoryId ?? null,
    amount: existingBudget?.amount?.toString() ?? "",
    currency: existingBudget
      ? (existingBudget.currency ?? null)
      : preferredCurrency,
    period: existingBudget?.period ?? "MONTHLY",
    periodStart: existingBudget?.periodStart ?? new Date(),
    periodEnd: existingBudget?.periodEnd ?? new Date(),
    alertThreshold: existingBudget?.alertThreshold ?? DEFAULT_THRESHOLD,
  };
}

function useRenewalCategoryNormalization(
  renewalSource: BudgetRenewalSource | undefined,
  accessibleCategoryIds: ReadonlySet<string>,
  areCategoriesLoading: boolean,
  categoryError: unknown,
  setForm: SetForm
): void {
  useEffect(() => {
    if (!renewalSource || areCategoriesLoading || categoryError) return;
    const normalizedCategoryId = resolveRenewalCategoryId(
      renewalSource,
      accessibleCategoryIds
    );
    setForm((current) =>
      current.categoryId === renewalSource.categoryId &&
      current.categoryId !== normalizedCategoryId
        ? { ...current, categoryId: normalizedCategoryId }
        : current
    );
  }, [
    accessibleCategoryIds,
    areCategoriesLoading,
    categoryError,
    renewalSource,
    setForm,
  ]);
}

function usePreferredCurrencyHydration(
  isEditMode: boolean,
  isLoading: boolean,
  hasUserSelectedCurrency: boolean,
  preferredCurrency: CurrencyType,
  renewalSource: BudgetRenewalSource | undefined,
  setForm: SetForm
): void {
  useEffect(() => {
    if (isEditMode || isLoading || hasUserSelectedCurrency) return;
    setForm((current) => {
      if (
        current.currency === preferredCurrency ||
        (renewalSource && current.currency !== null)
      ) {
        return current;
      }
      return { ...current, currency: preferredCurrency };
    });
  }, [
    hasUserSelectedCurrency,
    isEditMode,
    isLoading,
    preferredCurrency,
    renewalSource,
    setForm,
  ]);
}

function useFormMutators(
  isEditMode: boolean,
  setForm: SetForm,
  setErrors: SetErrors
): FormMutators {
  const updateField = useCallback(
    <K extends keyof BudgetFormState>(
      key: K,
      value: BudgetFormState[K]
    ): void => {
      setForm((current) => ({ ...current, [key]: value }));
      const mappedKeys: Partial<
        Record<keyof BudgetFormState, keyof BudgetFormErrors>
      > = {
        categoryId: "category",
        periodStart: "period",
        periodEnd: "period",
      };
      const errorKey = mappedKeys[key] ?? (key as keyof BudgetFormErrors);
      setErrors((current) => ({
        ...current,
        [errorKey]: undefined,
        general: undefined,
      }));
    },
    [setErrors, setForm]
  );

  const handleScopeChange = useCallback(
    (type: BudgetFormState["type"]): void => {
      if (isEditMode) return;
      setForm((current) => ({
        ...current,
        type,
        categoryId: type === "GLOBAL" ? null : current.categoryId,
      }));
      setErrors((current) => ({
        ...current,
        category: undefined,
        general: undefined,
      }));
    },
    [isEditMode, setErrors, setForm]
  );

  return { updateField, handleScopeChange };
}

function useBudgetFormResources(): BudgetFormResources {
  const {
    expenseCategories,
    isLoading: areCategoriesLoading,
    error: categoryError,
    retry: retryCategories,
  } = useCategories();
  const categoryMap = useCategoryLookup();
  const accessibleCategoryIds = useMemo(
    () => new Set(categoryMap.keys()),
    [categoryMap]
  );
  const { preferredCurrency, isLoading: isPreferredCurrencyLoading } =
    usePreferredCurrency();

  return {
    expenseCategories,
    areCategoriesLoading,
    categoryError,
    retryCategories,
    categoryMap,
    accessibleCategoryIds,
    preferredCurrency,
    isPreferredCurrencyLoading,
  };
}

function useBudgetFormCoreState(
  props: BudgetFormProps,
  resources: BudgetFormResources
): BudgetFormCoreState {
  const isEditMode = !!props.existingBudget;
  const isRenewalMode = !!props.renewalSource && !isEditMode;
  const categoriesReady =
    !resources.areCategoriesLoading && !resources.categoryError;
  const [form, setForm] = useState<BudgetFormState>(() =>
    buildInitialState(
      props.existingBudget,
      props.renewalSource,
      resources.preferredCurrency,
      categoriesReady,
      resources.accessibleCategoryIds
    )
  );
  const [errors, setErrors] = useState<BudgetFormErrors>({});
  const [hasUserSelectedCurrency, setHasUserSelectedCurrency] = useState(false);

  useRenewalCategoryNormalization(
    props.renewalSource,
    resources.accessibleCategoryIds,
    resources.areCategoriesLoading,
    resources.categoryError,
    setForm
  );
  usePreferredCurrencyHydration(
    isEditMode,
    resources.isPreferredCurrencyLoading,
    hasUserSelectedCurrency,
    resources.preferredCurrency,
    props.renewalSource,
    setForm
  );

  return {
    form,
    setForm,
    errors,
    setErrors,
    hasUserSelectedCurrency,
    setHasUserSelectedCurrency,
    isEditMode,
    isRenewalMode,
  };
}

function useBudgetFormModel(props: BudgetFormProps): BudgetFormModel {
  const resources = useBudgetFormResources();
  const core = useBudgetFormCoreState(props, resources);
  const mutators = useFormMutators(
    core.isEditMode,
    core.setForm,
    core.setErrors
  );
  const categoryDisplayName = core.form.categoryId
    ? resources.categoryMap.get(core.form.categoryId)?.displayName
    : undefined;
  const isWaitingForCreateCurrency =
    !core.isEditMode &&
    resources.isPreferredCurrencyLoading &&
    !core.hasUserSelectedCurrency &&
    (!props.renewalSource || core.form.currency === null);

  return {
    ...resources,
    ...core,
    ...mutators,
    categoryDisplayName,
    isWaitingForCreateCurrency,
  };
}

function useBudgetValidation(
  form: BudgetFormState,
  areCategoriesLoading: boolean,
  categoryError: unknown,
  setErrors: SetErrors
): () => boolean {
  const { t } = useTranslation("budgets");
  return useCallback((): boolean => {
    const nextErrors: BudgetFormErrors = {};
    if (!form.name.trim()) nextErrors.name = t("validation_name_required");
    if (parsePositiveMoneyAmount(form.amount) === null) {
      nextErrors.amount = t("validation_amount_invalid");
    }
    if (form.type === "CATEGORY") {
      if (areCategoriesLoading || categoryError) {
        nextErrors.category = t("category_load_error");
      } else if (!form.categoryId) {
        nextErrors.category = t("validation_category_required");
      }
    }
    if (
      form.period === "CUSTOM" &&
      form.periodEnd.getTime() <= form.periodStart.getTime()
    ) {
      nextErrors.period = t("validation_date_order");
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [areCategoriesLoading, categoryError, form, setErrors, t]);
}

function buildUpdateInput(
  form: BudgetFormState,
  amount: number
): UpdateBudgetInput {
  return {
    name: form.name.trim(),
    amount,
    period: form.period,
    alertThreshold: form.alertThreshold,
    ...(form.period === "CUSTOM" && {
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
    }),
    ...(form.type === "CATEGORY" && {
      categoryId: form.categoryId ?? undefined,
    }),
  };
}

function buildCreateInput(
  form: BudgetFormState,
  amount: number,
  currency: CurrencyType
): CreateBudgetInput {
  return {
    name: form.name.trim(),
    type: form.type,
    categoryId:
      form.type === "CATEGORY" ? (form.categoryId ?? undefined) : undefined,
    amount,
    currency,
    period: form.period,
    alertThreshold: form.alertThreshold,
    ...(form.period === "CUSTOM" && {
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
    }),
  };
}

function useBudgetPersistence(
  existingBudget: Budget | undefined,
  form: BudgetFormState,
  isEditMode: boolean,
  setErrors: SetErrors,
  setIsSubmitting: Dispatch<SetStateAction<boolean>>
): PersistBudget {
  const { showToast } = useToast();
  const { t } = useTranslation("budgets");

  return useCallback(
    async (amount: number, currency: BudgetFormState["currency"]) => {
      setIsSubmitting(true);
      try {
        if (isEditMode && existingBudget) {
          await updateBudget(existingBudget.id, buildUpdateInput(form, amount));
          showToast({
            type: "success",
            title: t("budget_updated"),
            message: t("budget_updated_message"),
          });
        } else {
          if (!currency) {
            setErrors({ general: t("validation_currency_required") });
            return;
          }
          await createBudget(buildCreateInput(form, amount, currency));
          showToast({
            type: "success",
            title: t("budget_created"),
            message: t("budget_created_message"),
          });
        }
        router.back();
      } catch (error) {
        setErrors({
          general: error instanceof Error ? error.message : t("save_failed"),
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [existingBudget, form, isEditMode, setErrors, setIsSubmitting, showToast, t]
  );
}

function useBudgetSubmitHandlers(
  model: BudgetFormModel,
  validate: () => boolean,
  persistBudget: PersistBudget,
  setShowRenewalConfirmation: Dispatch<SetStateAction<boolean>>
): BudgetSubmitHandlers {
  const { t } = useTranslation("budgets");

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (model.isWaitingForCreateCurrency || !validate()) return;
    const amount = parsePositiveMoneyAmount(model.form.amount);
    if (amount === null) return;
    if (!model.isEditMode && !model.form.currency) {
      model.setErrors({ general: t("validation_currency_required") });
      return;
    }
    if (model.isRenewalMode) {
      setShowRenewalConfirmation(true);
      return;
    }
    await persistBudget(amount, model.form.currency);
  }, [model, persistBudget, setShowRenewalConfirmation, t, validate]);

  const handleConfirmRenewal = useCallback(async (): Promise<void> => {
    if (!validate()) {
      setShowRenewalConfirmation(false);
      return;
    }
    const amount = parsePositiveMoneyAmount(model.form.amount);
    if (amount === null || !model.form.currency) {
      setShowRenewalConfirmation(false);
      return;
    }
    setShowRenewalConfirmation(false);
    await persistBudget(amount, model.form.currency);
  }, [
    model.form.amount,
    model.form.currency,
    persistBudget,
    setShowRenewalConfirmation,
    validate,
  ]);

  return { handleSubmit, handleConfirmRenewal };
}

function useBudgetPreview(form: BudgetFormState): BudgetPreview {
  return useMemo(() => {
    const amount = parsePositiveMoneyAmount(form.amount);
    const alertAmount =
      amount === null
        ? null
        : calculateBudgetAlertAmount(amount, form.alertThreshold);
    const bounds = getCurrentPeriodBounds(
      form.period,
      form.period === "CUSTOM" ? form.periodStart : undefined,
      form.period === "CUSTOM" ? form.periodEnd : undefined
    );
    const secondaryDate =
      form.period === "CUSTOM"
        ? bounds.end
        : new Date(bounds.end.getTime() + 1);
    return {
      amount,
      alertAmount,
      startDate: formatDate(bounds.start, "MMM d, yyyy"),
      secondaryDate: formatDate(secondaryDate, "MMM d, yyyy"),
    };
  }, [
    form.alertThreshold,
    form.amount,
    form.period,
    form.periodEnd,
    form.periodStart,
  ]);
}

function useBudgetOverlayState(
  updateField: UpdateBudgetFormField,
  setHasUserSelectedCurrency: Dispatch<SetStateAction<boolean>>
): BudgetOverlayState {
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isCurrencyPickerOpen, setIsCurrencyPickerOpen] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const selectCategory = useCallback(
    (id: string): void => {
      updateField("categoryId", id);
      setIsCategoryModalOpen(false);
    },
    [updateField]
  );
  const selectCurrency = useCallback(
    (currency: CurrencyType): void => {
      setHasUserSelectedCurrency(true);
      updateField("currency", currency);
      setIsCurrencyPickerOpen(false);
    },
    [setHasUserSelectedCurrency, updateField]
  );

  return {
    isCategoryModalOpen,
    isCurrencyPickerOpen,
    showStartPicker,
    showEndPicker,
    openCategoryModal: () => setIsCategoryModalOpen(true),
    closeCategoryModal: () => setIsCategoryModalOpen(false),
    openCurrencyPicker: () => setIsCurrencyPickerOpen(true),
    closeCurrencyPicker: () => setIsCurrencyPickerOpen(false),
    openStartPicker: () => setShowStartPicker(true),
    closeStartPicker: () => setShowStartPicker(false),
    openEndPicker: () => setShowEndPicker(true),
    closeEndPicker: () => setShowEndPicker(false),
    selectCategory,
    selectCurrency,
  };
}

export function useBudgetFormController(
  props: BudgetFormProps
): BudgetFormController {
  const model = useBudgetFormModel(props);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRenewalConfirmation, setShowRenewalConfirmation] = useState(false);
  const validate = useBudgetValidation(
    model.form,
    model.areCategoriesLoading,
    model.categoryError,
    model.setErrors
  );
  const persistBudget = useBudgetPersistence(
    props.existingBudget,
    model.form,
    model.isEditMode,
    model.setErrors,
    setIsSubmitting
  );
  const submitHandlers = useBudgetSubmitHandlers(
    model,
    validate,
    persistBudget,
    setShowRenewalConfirmation
  );
  const overlays = useBudgetOverlayState(
    model.updateField,
    model.setHasUserSelectedCurrency
  );
  const preview = useBudgetPreview(model.form);
  const isSubmitDisabled =
    isSubmitting ||
    (model.form.type === "CATEGORY" && model.areCategoriesLoading) ||
    model.isWaitingForCreateCurrency;

  return {
    ...model,
    ...overlays,
    ...submitHandlers,
    preview,
    isSubmitting,
    isSubmitDisabled,
    showRenewalConfirmation,
    cancelRenewalConfirmation: () => setShowRenewalConfirmation(false),
    cancelForm: () => router.back(),
  };
}