import "edge-runtime";
import { createClient } from "@supabase/supabase-js";
import { assertPositiveFiniteRateValues } from "../_shared/market-rate-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * API response shape when calling metals.dev with currency=USD.
 * Each currency value represents "how much 1 unit of that currency is worth in USD".
 * Example: EGP = 0.0210523309 means 1 EGP ≈ $0.021 USD.
 * USD itself will always be 1 (not stored in the database).
 */
interface CurrenciesApiResponse {
  AED: number; // United Arab Emirates (Dirham)
  AUD: number; // Australia (Dollar)
  BHD: number; // Bahrain (Dinar)
  BTC: number; // Bitcoin (Crypto)
  CAD: number; // Canada (Dollar)
  CHF: number; // Switzerland (Franc)
  CNH: number; // China (Offshore Yuan) — present in API, not stored
  CNY: number; // China (Yuan Renminbi)
  DKK: number; // Denmark (Krone)
  DZD: number; // Algeria (Dinar)
  EGP: number; // Egypt (Pound)
  EUR: number; // Eurozone (Euro)
  GBP: number; // United Kingdom (Pound)
  HKD: number; // Hong Kong (Dollar)
  INR: number; // India (Rupee)
  IQD: number; // Iraq (Dinar)
  ISK: number; // Iceland (Krona)
  JOD: number; // Jordan (Dinar)
  JPY: number; // Japan (Yen)
  KPW: number; // North Korea (Won)
  KRW: number; // South Korea (Won)
  KWD: number; // Kuwait (Dinar)
  LYD: number; // Libya (Dinar)
  MAD: number; // Morocco (Dirham)
  MYR: number; // Malaysia (Ringgit)
  NOK: number; // Norway (Krone)
  NZD: number; // New Zealand (Dollar)
  OMR: number; // Oman (Rial)
  QAR: number; // Qatar (Riyal)
  RUB: number; // Russia (Ruble)
  SAR: number; // Saudi Arabia (Riyal)
  SEK: number; // Sweden (Krona)
  SGD: number; // Singapore (Dollar)
  TND: number; // Tunisia (Dinar)
  TRY: number; // Turkey (Lira)
  USD: number; // United States (Dollar) — always 1, not stored
  ZAR: number; // South Africa (Rand)
}

/**
 * Metal prices in USD per gram when called with currency=USD&unit=g
 */
interface MetalsApiResponse {
  gold: number;
  silver: number;
  platinum: number;
  palladium: number;
}

interface MetalsDevApiResponse {
  status: string;
  currency: string;
  unit: string;

  metals: MetalsApiResponse;
  currencies: CurrenciesApiResponse;
  timestamps: {
    metal: string;
    currency: string;
  };
}

/**
 * Database row shape for the market_rates table (USD-based).
 * Each currency column stores "value of 1 unit of that currency in USD".
 * Metal columns store "USD per gram".
 * Note: USD is implicit (always 1) and CNH is not stored.
 */
interface MarketRatesRow {
  // Precious metal prices (USD per gram)
  gold_usd_per_gram: number;
  silver_usd_per_gram: number;
  platinum_usd_per_gram: number;
  palladium_usd_per_gram: number;
  // Currency exchange rates (value of 1 unit in USD)
  egp_usd: number;
  eur_usd: number;
  gbp_usd: number;
  aed_usd: number;
  aud_usd: number;
  bhd_usd: number;
  btc_usd: number;
  cad_usd: number;
  chf_usd: number;
  cny_usd: number;
  dkk_usd: number;
  dzd_usd: number;
  hkd_usd: number;
  inr_usd: number;
  iqd_usd: number;
  isk_usd: number;
  jod_usd: number;
  jpy_usd: number;
  kpw_usd: number;
  krw_usd: number;
  kwd_usd: number;
  lyd_usd: number;
  mad_usd: number;
  myr_usd: number;
  nok_usd: number;
  nzd_usd: number;
  omr_usd: number;
  qar_usd: number;
  rub_usd: number;
  sar_usd: number;
  sek_usd: number;
  sgd_usd: number;
  tnd_usd: number;
  try_usd: number;
  zar_usd: number;
  // Timestamps
  timestamp_metal: string;
  timestamp_currency: string;
  created_at: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the metals.dev API key from environment
    const metalsApiKey =
      Deno.env.get("METALS.DEV_API_KEY") ?? Deno.env.get("METALS_DEV_API_KEY");
    if (!metalsApiKey) {
      throw new Error(
        "METALS.DEV_API_KEY or METALS_DEV_API_KEY is not configured"
      );
    }

    // Fetch from metals.dev API with currency=USD (universal base)
    const apiUrl = `https://api.metals.dev/v1/latest?api_key=${metalsApiKey}&currency=USD&unit=g`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(
        `metals.dev API error: ${response.status} ${response.statusText}`
      );
    }

    const data: MetalsDevApiResponse = await response.json();

    if (data.status !== "success") {
      throw new Error(`metals.dev API returned status: ${data.status}`);
    }

    // Map API response to database row
    // Each currency value = "how much 1 unit of that currency is worth in USD"
    // USD is implicit (always 1) and CNH is dropped (CNY covers China)
    const marketRates: MarketRatesRow = {
      // Precious metal prices (USD per gram)
      gold_usd_per_gram: data.metals.gold,
      silver_usd_per_gram: data.metals.silver,
      platinum_usd_per_gram: data.metals.platinum,
      palladium_usd_per_gram: data.metals.palladium,
      // Currency exchange rates (value of 1 unit in USD)
      egp_usd: data.currencies.EGP,
      eur_usd: data.currencies.EUR,
      gbp_usd: data.currencies.GBP,
      aed_usd: data.currencies.AED,
      aud_usd: data.currencies.AUD,
      bhd_usd: data.currencies.BHD,
      btc_usd: data.currencies.BTC,
      cad_usd: data.currencies.CAD,
      chf_usd: data.currencies.CHF,
      cny_usd: data.currencies.CNY,
      dkk_usd: data.currencies.DKK,
      dzd_usd: data.currencies.DZD,
      hkd_usd: data.currencies.HKD,
      inr_usd: data.currencies.INR,
      iqd_usd: data.currencies.IQD,
      isk_usd: data.currencies.ISK,
      jod_usd: data.currencies.JOD,
      jpy_usd: data.currencies.JPY,
      kpw_usd: data.currencies.KPW,
      krw_usd: data.currencies.KRW,
      kwd_usd: data.currencies.KWD,
      lyd_usd: data.currencies.LYD,
      mad_usd: data.currencies.MAD,
      myr_usd: data.currencies.MYR,
      nok_usd: data.currencies.NOK,
      nzd_usd: data.currencies.NZD,
      omr_usd: data.currencies.OMR,
      qar_usd: data.currencies.QAR,
      rub_usd: data.currencies.RUB,
      sar_usd: data.currencies.SAR,
      sek_usd: data.currencies.SEK,
      sgd_usd: data.currencies.SGD,
      tnd_usd: data.currencies.TND,
      try_usd: data.currencies.TRY,
      zar_usd: data.currencies.ZAR,
      // Timestamps
      timestamp_metal: data.timestamps.metal,
      timestamp_currency: data.timestamps.currency,
      created_at: new Date().toISOString(),
    };

    assertPositiveFiniteRateValues(marketRates);

    // Create Supabase client with service role for database access
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase environment variables not configured");
    }

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Insert new row into market_rates table
    const { error: insertError } = await supabase
      .from("market_rates")
      .insert(marketRates);

    if (insertError) {
      throw new Error(`Database insert failed: ${insertError.message}`);
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: "Market rates updated successfully",
        data: {
          metals: {
            gold: marketRates.gold_usd_per_gram,
            silver: marketRates.silver_usd_per_gram,
            platinum: marketRates.platinum_usd_per_gram,
            palladium: marketRates.palladium_usd_per_gram,
          },
          currencies: {
            egp: marketRates.egp_usd,
            eur: marketRates.eur_usd,
            gbp: marketRates.gbp_usd,
          },
          timestamps: {
            metal: marketRates.timestamp_metal,
            currency: marketRates.timestamp_currency,
          },
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    console.error("fetch-metal-rates error:", errorMessage);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
