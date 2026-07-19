import { activateTrustedSmsCatalog as validateAndActivateCatalog } from "./trusted-sms-pattern-catalog";
import type {
  TrustedSmsCatalog,
  TrustedSmsCatalogActivation,
  TrustedSmsCatalogProvider,
} from "./trusted-sms-pattern-types";

export function createBundledTrustedSmsCatalogProvider(
  catalog: TrustedSmsCatalog
): TrustedSmsCatalogProvider {
  const activation = validateAndActivateCatalog(catalog);
  return {
    getActivation(): TrustedSmsCatalogActivation {
      return activation;
    },
  };
}

export function activateTrustedSmsCatalog(
  catalog: TrustedSmsCatalog
): TrustedSmsCatalogActivation {
  return validateAndActivateCatalog(catalog);
}
