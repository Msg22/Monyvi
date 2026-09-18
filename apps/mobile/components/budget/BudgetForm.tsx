/**
 * Shared Create/Edit/Renew budget form.
 *
 * State, persistence, and the premium visual sections are split into focused
 * controller and presentation modules so this entry point stays compositional.
 *
 * @module BudgetForm
 */

import React from "react";
import {
  useBudgetFormController,
  type BudgetFormProps,
} from "./budget-form-controller";
import { BudgetFormScreen } from "./BudgetFormSections";
import { BudgetFormOverlays } from "./BudgetFormOverlays";

export function BudgetForm(props: BudgetFormProps): React.JSX.Element {
  const controller = useBudgetFormController(props);
  return (
    <>
      <BudgetFormScreen controller={controller} />
      <BudgetFormOverlays controller={controller} />
    </>
  );
}
