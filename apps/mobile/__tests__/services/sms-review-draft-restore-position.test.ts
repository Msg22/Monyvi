import { getSmsReviewDraftItemsToShiftForRestore } from "@/services/sms-review-draft-restore-position";

describe("getSmsReviewDraftItemsToShiftForRestore", () => {
  it("shifts an item appended into the discarded last item's position", () => {
    expect(
      getSmsReviewDraftItemsToShiftForRestore(
        [{ position: 0 }, { position: 1 }, { position: 2 }],
        2
      )
    ).toEqual([{ position: 2 }]);
  });

  it("shifts a recreated queue append while preserving all earlier positions", () => {
    expect(
      getSmsReviewDraftItemsToShiftForRestore(
        [{ position: 0 }, { position: 1 }],
        0
      )
    ).toEqual([{ position: 1 }, { position: 0 }]);
  });
});
