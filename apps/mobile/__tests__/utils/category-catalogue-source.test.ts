import {
  buildCategoryCatalogueManifestKey,
  CATEGORY_CATALOGUE_MANIFEST_VERSION,
  normalizeCatalogueOrigin,
  parseCategoryCatalogueManifest,
  serializeCategoryCatalogueManifest,
  type CategoryCatalogueManifest,
} from "@/utils/category-catalogue-source";

const ORIGIN = "https://project.supabase.co";
const OWNER = "owner-1";

function manifest(
  overrides: Partial<CategoryCatalogueManifest> = {}
): CategoryCatalogueManifest {
  return {
    version: CATEGORY_CATALOGUE_MANIFEST_VERSION,
    origin: ORIGIN,
    ownerId: OWNER,
    acceptedAt: 1_700_000_000_000,
    snapshotComplete: true,
    systemIds: ["system-1"],
    customOwnerIds: [],
    ...overrides,
  };
}

describe("normalizeCatalogueOrigin", (): void => {
  it("keeps scheme, host, port and a custom path prefix", (): void => {
    expect(normalizeCatalogueOrigin("http://10.0.2.2:54321/")).toBe(
      "http://10.0.2.2:54321"
    );
    expect(normalizeCatalogueOrigin("https://host.example/custom/path/")).toBe(
      "https://host.example/custom/path"
    );
  });

  it("drops query strings, fragments and user information", (): void => {
    expect(
      normalizeCatalogueOrigin("https://host.example/p?apikey=secret#frag")
    ).toBe("https://host.example/p");
  });

  it("fails closed for invalid urls and unsupported protocols", (): void => {
    expect(normalizeCatalogueOrigin("not a url")).toBeNull();
    expect(normalizeCatalogueOrigin("")).toBeNull();
    expect(normalizeCatalogueOrigin("ftp://host.example")).toBeNull();
    expect(normalizeCatalogueOrigin("file:///tmp/db")).toBeNull();
  });
});

describe("buildCategoryCatalogueManifestKey", (): void => {
  it("is collision free per origin and owner and holds no secret", (): void => {
    const first = buildCategoryCatalogueManifestKey(ORIGIN, OWNER);
    const second = buildCategoryCatalogueManifestKey(ORIGIN, "owner-2");
    const other = buildCategoryCatalogueManifestKey(
      "http://10.0.2.2:54321",
      OWNER
    );

    expect(first).not.toBe(second);
    expect(first).not.toBe(other);
    expect(first).toContain(encodeURIComponent(ORIGIN));
    expect(first).toContain(OWNER);
    expect(first).not.toContain("secret");
  });
});

describe("parseCategoryCatalogueManifest", (): void => {
  it("accepts a valid manifest for the expected pair", (): void => {
    const parsed = parseCategoryCatalogueManifest(
      serializeCategoryCatalogueManifest(manifest()),
      ORIGIN,
      OWNER
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.systemIds).toEqual(["system-1"]);
    expect(parsed?.ownerId).toBe(OWNER);
  });

  it("accepts a valid empty catalogue as an explicit state", (): void => {
    const parsed = parseCategoryCatalogueManifest(
      serializeCategoryCatalogueManifest(
        manifest({ systemIds: [], customOwnerIds: [] })
      ),
      ORIGIN,
      OWNER
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.systemIds).toEqual([]);
    expect(parsed?.snapshotComplete).toBe(true);
  });

  it("rejects foreign pairs, wrong versions and malformed payloads", (): void => {
    const raw = serializeCategoryCatalogueManifest(manifest());

    expect(parseCategoryCatalogueManifest(raw, ORIGIN, "owner-2")).toBeNull();
    expect(
      parseCategoryCatalogueManifest(raw, "https://other.supabase.co", OWNER)
    ).toBeNull();
    expect(
      parseCategoryCatalogueManifest(
        serializeCategoryCatalogueManifest(manifest({ version: 1 })),
        ORIGIN,
        OWNER
      )
    ).toBeNull();
    expect(
      parseCategoryCatalogueManifest("not json", ORIGIN, OWNER)
    ).toBeNull();
    expect(parseCategoryCatalogueManifest(null, ORIGIN, OWNER)).toBeNull();
  });

  it("rejects incomplete, non positive and malformed id lists", (): void => {
    expect(
      parseCategoryCatalogueManifest(
        serializeCategoryCatalogueManifest(
          manifest({ snapshotComplete: false })
        ),
        ORIGIN,
        OWNER
      )
    ).toBeNull();
    expect(
      parseCategoryCatalogueManifest(
        serializeCategoryCatalogueManifest(manifest({ acceptedAt: 0 })),
        ORIGIN,
        OWNER
      )
    ).toBeNull();
    expect(
      parseCategoryCatalogueManifest(
        serializeCategoryCatalogueManifest(
          manifest({ systemIds: [""] as never })
        ),
        ORIGIN,
        OWNER
      )
    ).toBeNull();
  });
});
