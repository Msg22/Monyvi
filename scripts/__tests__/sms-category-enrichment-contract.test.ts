import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSmsCategoryPrompt,
  buildSmsCategoryResponseSchema,
  parseSmsCategoryRequest,
  parseSmsCategoryResponse,
} from "../../supabase/functions/_shared/sms-category-enrichment-contract";

const validRequest = {
  merchants: [
    {
      id: "merchant-1",
      merchant: "MYFAWRY",
      transactionType: "EXPENSE",
      messageFamily: "card_purchase",
    },
  ],
};

test("accepts only the minimal category request contract", () => {
  assert.deepEqual(parseSmsCategoryRequest(validRequest), validRequest);
  assert.equal(
    parseSmsCategoryRequest({
      ...validRequest,
      allowedCategorySystemNames: ["asset_purchase"],
    }),
    null
  );
  assert.equal(
    parseSmsCategoryRequest({
      ...validRequest,
      rawSmsBody: "Private financial message",
    }),
    null
  );
  assert.deepEqual(
    parseSmsCategoryRequest({
      ...validRequest,
      merchants: [{ ...validRequest.merchants[0], amount: 100 }],
    }),
    null
  );
});

test("rejects duplicate identities and non-card-purchase work", () => {
  assert.equal(
    parseSmsCategoryRequest({
      ...validRequest,
      merchants: [validRequest.merchants[0], validRequest.merchants[0]],
    }),
    null
  );
  assert.equal(
    parseSmsCategoryRequest({
      ...validRequest,
      merchants: [
        { ...validRequest.merchants[0], messageFamily: "atm_withdrawal" },
      ],
    }),
    null
  );
});

test("enforces the 20-merchant endpoint chunk boundary", () => {
  const merchants = Array.from({ length: 21 }, (_, index) => ({
    ...validRequest.merchants[0],
    id: `merchant-${index + 1}`,
    merchant: `Merchant ${index + 1}`,
  }));

  assert.ok(
    parseSmsCategoryRequest({
      ...validRequest,
      merchants: merchants.slice(0, 20),
    })
  );
  assert.equal(parseSmsCategoryRequest({ ...validRequest, merchants }), null);
});

test("keeps the provider response constraint compact and independent of catalog size", () => {
  const schema = buildSmsCategoryResponseSchema(20);
  const serialized = JSON.stringify(schema);

  assert.ok(serialized.includes('"pattern":"^merchant-[1-9]\\\\d*$"'));
  assert.doesNotMatch(serialized, /merchant-20/);
  assert.doesNotMatch(serialized, /shopping/);
  assert.doesNotMatch(serialized, /Allowed categories/);
  assert.match(serialized, /categorySystemName/);
});

test("validates provider categories against identities and the server allowlist", () => {
  const request = parseSmsCategoryRequest(validRequest);
  assert.ok(request);
  assert.deepEqual(
    parseSmsCategoryResponse(
      {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping",
            confidence: 0.95,
          },
        ],
      },
      request
    ),
    {
      categories: [
        {
          merchantId: "merchant-1",
          categorySystemName: "shopping",
          confidence: 0.95,
        },
      ],
    }
  );
  assert.deepEqual(
    parseSmsCategoryResponse(
      {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "invented",
            confidence: 0.99,
          },
        ],
      },
      request
    ),
    { categories: [] }
  );
  assert.deepEqual(
    parseSmsCategoryResponse(
      {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "asset_purchase",
            confidence: 0.99,
          },
        ],
      },
      request
    ),
    { categories: [] }
  );
  for (const fallbackCategory of ["other", "uncategorized"]) {
    assert.deepEqual(
      parseSmsCategoryResponse(
        {
          categories: [
            {
              merchantId: "merchant-1",
              categorySystemName: fallbackCategory,
              confidence: 0.99,
            },
          ],
        },
        request
      ),
      { categories: [] }
    );
  }
});

test("rejects only a malformed or duplicated merchant identity", () => {
  const request = parseSmsCategoryRequest({
    merchants: [
      validRequest.merchants[0],
      { ...validRequest.merchants[0], id: "merchant-2", merchant: "Orange" },
    ],
  });
  assert.ok(request);

  assert.deepEqual(
    parseSmsCategoryResponse(
      {
        categories: [
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping",
            confidence: 0.95,
          },
          {
            merchantId: "merchant-1",
            categorySystemName: "shopping",
            confidence: "invalid",
          },
          {
            merchantId: "merchant-2",
            categorySystemName: "utilities_bills",
            confidence: 0.96,
          },
        ],
      },
      request
    ),
    {
      categories: [
        {
          merchantId: "merchant-2",
          categorySystemName: "utilities_bills",
          confidence: 0.96,
        },
      ],
    }
  );
});

test("builds a categorization-only prompt without financial message fields", () => {
  const request = parseSmsCategoryRequest(validRequest);
  assert.ok(request);
  const prompt = buildSmsCategoryPrompt(request);

  assert.match(prompt, /MYFAWRY/);
  assert.match(prompt, /shopping/);
  for (const forbidden of [
    "rawSmsBody",
    "sender",
    "amount",
    "balance",
    "currency",
    "cardLast4",
    "smsFingerprint",
  ]) {
    assert.doesNotMatch(prompt, new RegExp(forbidden, "i"));
  }
});
