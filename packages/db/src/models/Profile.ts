import type { NotificationSettings, OnboardingFlags } from "../types";
import { BaseProfile } from "./base/base-profile";

export class Profile extends BaseProfile {
  get notificationSettings(): NotificationSettings | undefined {
    if (!this.notificationSettingsRaw) return undefined;
    try {
      return JSON.parse(this.notificationSettingsRaw) as NotificationSettings;
    } catch {
      return undefined;
    }
  }

  get onboardingFlags(): OnboardingFlags {
    if (!this.onboardingFlagsRaw) return {};
    try {
      return JSON.parse(this.onboardingFlagsRaw) as OnboardingFlags;
    } catch {
      return {};
    }
  }

  get fullName(): string {
    if (this.firstName && this.lastName) {
      return `${this.firstName} ${this.lastName}`;
    }
    return this.displayName || this.firstName || "";
  }
}
